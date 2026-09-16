import { getWebsetItems, searchInfluencers, canonicalizeLeadUrl } from '@autogtm/core/clients/exa';

function detectPlatform(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('instagram')) return 'instagram';
    if (host.includes('tiktok')) return 'tiktok';
    if (host.includes('youtube')) return 'youtube';
    if (host.includes('linkedin')) return 'linkedin';
    if (host.includes('twitter') || host.includes('x.com')) return 'twitter';
    if (host.includes('facebook')) return 'facebook';
    return host;
  } catch {
    return null;
  }
}

function findEmail(enrichments: Record<string, unknown> | undefined): string | null {
  if (!enrichments) return null;
  for (const value of Object.values(enrichments)) {
    if (typeof value === 'string' && /.+@.+\..+/.test(value)) return value;
  }
  return null;
}

function titleKey(name: string | null | undefined): string {
  return (name || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, 100);
}

export async function startQueryRun(
  supabase: any,
  queryId: string
): Promise<{ websetId: string; status: 'completed'; message: string; resultsCount: number; leadsCreated: number }> {
  const { data: query, error: queryError } = await supabase
    .from('exa_queries')
    .select('*')
    .eq('id', queryId)
    .single();

  if (queryError || !query) {
    throw new Error('Query not found');
  }

  await supabase
    .from('exa_queries')
    .update({ status: 'running', is_active: true })
    .eq('id', queryId);

  try {
  const result = await searchInfluencers({
    query: query.query,
    count: 25,
    criteria: query.criteria || [],
    includeEmail: true,
  });

  const { data: websetRun, error: runError } = await supabase
    .from('webset_runs')
    .insert({
      query_id: queryId,
      webset_id: result.websetId,
      status: 'completed',
      items_found: result.items.length,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError) throw runError;

  const { data: existingLeads } = await supabase.from('leads').select('url, name');
  const seenUrls = new Set((existingLeads || []).map((row: { url: string }) => row.url));
  const seenTitles = new Set(
    (existingLeads || [])
      .map((row: { name: string | null }) => titleKey(row.name))
      .filter((key: string) => key.length >= 24)
  );

  let leadsCreated = 0;
  for (const item of await getWebsetItems(result.websetId)) {
    const url = canonicalizeLeadUrl(item.properties?.url);
    if (!url || seenUrls.has(url)) continue;

    const name = item.properties.title || null;
    const key = titleKey(name);
    if (key.length >= 24 && seenTitles.has(key)) continue;

    const { error: leadError } = await supabase.from('leads').insert({
      query_id: queryId,
      webset_run_id: websetRun.id,
      name,
      email: findEmail(item.enrichments),
      url,
      platform: detectPlatform(url),
      follower_count: null,
      enrichment_data: {
        title: item.properties.title,
        description: item.properties.description,
        display_link: item.properties.display_link,
        source: item.properties.source,
        enrichments: item.enrichments || {},
      },
      enrichment_status: 'pending',
    });

    if (leadError) continue;
    seenUrls.add(url);
    if (key.length >= 24) seenTitles.add(key);
    leadsCreated += 1;
  }

  await supabase
    .from('exa_queries')
    .update({ status: 'completed', last_run_at: new Date().toISOString() })
    .eq('id', queryId);

  return {
    websetId: result.websetId,
    status: 'completed',
    message: 'Search completed.',
    resultsCount: result.items.length,
    leadsCreated,
  };
  } catch (error) {
    await supabase.from('exa_queries').update({ status: 'failed' }).eq('id', queryId);
    throw error;
  }
}
