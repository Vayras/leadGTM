import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@autogtm/core/db/supabaseCompat';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: queryId } = await params;

    const supabase = createClient();

    const { data: query, error: queryError } = await supabase
      .from('exa_queries')
      .select('status, last_run_at')
      .eq('id', queryId)
      .single();

    if (queryError || !query) {
      return NextResponse.json({ status: 'not_found' }, { status: 404 });
    }

    const { count: leadsCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('query_id', queryId);

    if (query.status === 'completed' || query.status === 'failed') {
      return NextResponse.json({
        status: query.status,
        leadsCreated: leadsCount || 0,
        completedAt: query.last_run_at,
      });
    }

    const { data: websetRun } = await supabase
      .from('webset_runs')
      .select('items_found')
      .eq('query_id', queryId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      status: query.status,
      leadsCreated: leadsCount || 0,
      progress: {
        found: websetRun?.items_found || 0,
        completion: query.status === 'running' ? 50 : 0,
      },
    });
  } catch (error) {
    console.error('Error checking status:', error);
    return NextResponse.json(
      { error: 'Failed to check status', status: 'error' },
      { status: 500 }
    );
  }
}
