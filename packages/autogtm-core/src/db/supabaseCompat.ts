import { queryRows } from './postgres';

type Sort = { column: string; ascending: boolean };
type Filter = { column: string; op: '=' | '!=' | 'is' | '>=' | '<=' | 'in'; value: unknown };
type RelationSelect = { table: string; inner: boolean; columns: string[] };

const RELATION_FK: Record<string, string> = {
  exa_queries: 'query_id',
  outreach_prompts: 'outreach_prompt_id',
  company_updates: 'source_instruction_id',
};

function quoteIdent(identifier: string): string {
  const parts = identifier.split('.');
  if (parts.some((part) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part))) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return parts.map((part) => `"${part}"`).join('.');
}

function extractRelations(select?: string): { rest: string; relations: RelationSelect[] } {
  const relations: RelationSelect[] = [];
  if (!select) return { rest: '*', relations };
  const rest = select.replace(
    /([a-zA-Z_][a-zA-Z0-9_]*)!(inner)\(([^)]*)\)|([a-zA-Z_][a-zA-Z0-9_]*)\(([^)]*)\)/g,
    (_match, innerTable, _inner, innerCols, leftTable, leftCols) => {
      const table = innerTable || leftTable;
      const cols = String(innerCols || leftCols || '')
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean);
      if (RELATION_FK[table]) {
        relations.push({ table, inner: Boolean(innerTable), columns: cols });
      }
      return '';
    }
  );
  return { rest, relations };
}

function normalizeSelect(select?: string): string {
  if (!select || select.trim() === '*' || select.includes('count')) return '*';
  if (select.includes('*')) return '*';
  const columns = select
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);
  if (columns.length === 0) return '*';
  return columns.map(quoteIdent).join(', ');
}

class PgQueryBuilder implements PromiseLike<{ data: any; error: any; count?: number }> {
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private selectColumns = '*';
  private rows: any;
  private updates: any;
  private filters: Filter[] = [];
  private sorts: Sort[] = [];
  private rowLimit?: number;
  private wantsSingle = false;
  private allowNoRows = false;
  private wantsCount = false;
  private headOnly = false;
  private relations: RelationSelect[] = [];

  constructor(private table: string) {}

  select(columns = '*', options?: { count?: 'exact'; head?: boolean }) {
    const parsed = extractRelations(columns);
    this.relations = parsed.relations;
    this.selectColumns = normalizeSelect(parsed.rest);
    this.wantsCount = options?.count === 'exact';
    this.headOnly = options?.head === true;
    if (this.action === 'select') {
      this.action = 'select';
    }
    return this;
  }

  insert(rows: any) {
    this.action = 'insert';
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(updates: any) {
    this.action = 'update';
    this.updates = updates;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: '=', value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ column, op: 'in', value: values });
    return this;
  }

  not(column: string, op: string, value: unknown) {
    this.filters.push({ column, op: op === 'is' ? 'is' : '!=', value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ column, op: '!=', value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ column, op: '>=', value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ column, op: '<=', value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.sorts.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(limit: number) {
    this.rowLimit = limit;
    return this;
  }

  single() {
    this.wantsSingle = true;
    return this;
  }

  maybeSingle() {
    this.wantsSingle = true;
    this.allowNoRows = true;
    return this;
  }

  private whereSql(values: unknown[]): string {
    if (!this.filters.length) return '';
    const clauses = this.filters.map((filter) => {
      const column = filter.column.includes('.')
        ? quoteIdent(filter.column)
        : `${quoteIdent(this.table)}.${quoteIdent(filter.column)}`;
      if (filter.op === 'is' && filter.value === null) return `${column} IS NULL`;
      if (filter.op === '!=' && filter.value === null) return `${column} IS NOT NULL`;
      values.push(filter.value);
      if (filter.op === 'in') return `${column} = ANY($${values.length})`;
      if (Array.isArray(filter.value) && filter.op === '=') return `${column} = ANY($${values.length})`;
      return `${column} ${filter.op} $${values.length}`;
    });
    return ` WHERE ${clauses.join(' AND ')}`;
  }

  private joinSql(): string {
    return this.relations
      .map((rel) => {
        const join = rel.inner ? 'INNER JOIN' : 'LEFT JOIN';
        return ` ${join} ${quoteIdent(rel.table)} ON ${quoteIdent(rel.table)}."id" = ${quoteIdent(this.table)}.${quoteIdent(RELATION_FK[rel.table])}`;
      })
      .join('');
  }

  private selectSql(): string {
    const base = `${quoteIdent(this.table)}.*`;
    const nested = this.relations.map((rel) => {
      const cols = rel.columns.length ? rel.columns : ['id'];
      const fields = cols.map((col) => `'${col}', ${quoteIdent(rel.table)}.${quoteIdent(col)}`).join(', ');
      return `jsonb_build_object(${fields}) AS ${quoteIdent(rel.table)}`;
    });
    return [base, ...nested].join(', ');
  }

  private orderSql(): string {
    if (!this.sorts.length) return '';
    const qualify = (column: string) =>
      column.includes('.') || !this.relations.length ? quoteIdent(column) : `${quoteIdent(this.table)}.${quoteIdent(column)}`;
    return ` ORDER BY ${this.sorts
      .map((sort) => `${qualify(sort.column)} ${sort.ascending ? 'ASC' : 'DESC'}`)
      .join(', ')}`;
  }

  private limitSql(values: unknown[]): string {
    if (!this.rowLimit) return '';
    values.push(this.rowLimit);
    return ` LIMIT $${values.length}`;
  }

  private async execute() {
    try {
      const values: unknown[] = [];
      let sql = '';

      if (this.action === 'select') {
        const countSql = this.wantsCount ? 'COUNT(*) OVER() AS __total_count, ' : '';
        const selectList = this.relations.length ? this.selectSql() : this.selectColumns;
        sql = `SELECT ${countSql}${selectList} FROM ${quoteIdent(this.table)}${this.joinSql()}${this.whereSql(values)}${this.orderSql()}${this.limitSql(values)}`;
      }

      if (this.action === 'insert') {
        const rows = this.rows || [];
        if (rows.length === 0) return { data: [], error: null };
        const columns = Object.keys(rows[0]);
        const tuples = rows.map((row: any) => {
          const placeholders = columns.map((column) => {
            values.push(row[column]);
            return `$${values.length}`;
          });
          return `(${placeholders.join(', ')})`;
        });
        sql = `INSERT INTO ${quoteIdent(this.table)} (${columns.map(quoteIdent).join(', ')}) VALUES ${tuples.join(', ')} RETURNING *`;
      }

      if (this.action === 'update') {
        const columns = Object.keys(this.updates || {});
        const assignments = columns.map((column) => {
          values.push(this.updates[column]);
          return `${quoteIdent(column)} = $${values.length}`;
        });
        sql = `UPDATE ${quoteIdent(this.table)} SET ${assignments.join(', ')}${this.whereSql(values)} RETURNING *`;
      }

      if (this.action === 'delete') {
        sql = `DELETE FROM ${quoteIdent(this.table)}${this.whereSql(values)} RETURNING *`;
      }

      const rows = await queryRows(sql, values);
      const count = this.wantsCount ? Number(rows[0]?.__total_count || 0) : undefined;
      const cleanedRows = rows.map(({ __total_count, ...row }: any) => row);
      const data = this.headOnly ? null : this.wantsSingle ? cleanedRows[0] || null : cleanedRows;

      if (this.wantsSingle && !data && !this.allowNoRows) {
        return { data: null, error: { code: 'PGRST116', message: 'No rows found' }, count };
      }

      return { data, error: null, count };
    } catch (error) {
      return { data: null, error };
    }
  }

  then<TResult1 = { data: any; error: any; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export function createClient(..._args: unknown[]) {
  return {
    from(table: string) {
      return new PgQueryBuilder(table);
    },
    async rpc(functionName: string, args: Record<string, unknown>) {
      if (functionName === 'increment_campaign_leads') {
        const campaignId = args.campaign_id_input;
        await queryRows('UPDATE campaigns SET leads_count = leads_count + 1, updated_at = now() WHERE id = $1', [campaignId]);
        return { data: null, error: null };
      }
      return { data: null, error: new Error(`Unsupported RPC: ${functionName}`) };
    },
  };
}
