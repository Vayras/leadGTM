import { Pool, type QueryResultRow } from 'pg';

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }

    pool = new Pool({
      connectionString,
      ssl:
        process.env.POSTGRES_SSL === 'true'
          ? { rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false' }
          : undefined,
    });
  }

  return pool;
}

export async function queryRows<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<T[]> {
  const result = await getPostgresPool().query<T>(text, values);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<T | null> {
  const rows = await queryRows<T>(text, values);
  return rows[0] || null;
}

export function nowIso(): string {
  return new Date().toISOString();
}
