import { NextRequest, NextResponse } from 'next/server';
import { updateExaQuery, deleteExaQuery } from '@autogtm/core/db/autogtmDbCalls';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updates: { query?: string; criteria?: string[]; is_active?: boolean; status?: 'pending' | 'failed' } = {};
    if (typeof body.query === 'string' && body.query.trim()) updates.query = body.query.trim();
    if (Array.isArray(body.criteria) && body.criteria.every((c: unknown) => typeof c === 'string')) {
      updates.criteria = body.criteria;
    }
    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;
    if (body.status === 'pending' || body.status === 'failed') updates.status = body.status;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    const updated = await updateExaQuery(id, updates);
    return NextResponse.json({ query: updated });
  } catch (error) {
    console.error('Error updating query:', error);
    return NextResponse.json(
      { error: 'Failed to update query' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteExaQuery(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting query:', error);
    return NextResponse.json(
      { error: 'Failed to delete query' },
      { status: 500 }
    );
  }
}
