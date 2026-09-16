/**
 * Bright Data SERP-backed search client.
 *
 * The rest of the app still uses the old "webset" vocabulary, so this module
 * keeps the same exports while replacing Exa with Bright Data.
 */

import type { ExaWebsetItem, ExaWebsetResponse } from '../types';

const BRIGHT_DATA_API_BASE = 'https://api.brightdata.com';

function getBrightDataConfig() {
  const apiKey = process.env.BRIGHT_DATA_API_KEY || process.env.BRIGHTDATA_API_KEY;
  const serpZone = process.env.BRIGHT_DATA_SERP_ZONE || process.env.BRIGHTDATA_SERP_ZONE || 'serp_api1';
  const country = process.env.BRIGHT_DATA_COUNTRY || 'us';
  const location = process.env.BRIGHT_DATA_LOCATION;

  if (!apiKey) {
    throw new Error('BRIGHT_DATA_API_KEY is required');
  }

  return { apiKey, serpZone, country, location };
}

async function brightDataRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { apiKey } = getBrightDataConfig();
  const maxAttempts = 3; // Google occasionally serves a captcha; a fresh peer usually clears it
  let lastError = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(`${BRIGHT_DATA_API_BASE}/request`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    const brdError = response.headers.get('x-brd-error-code') || response.headers.get('x-brd-error');

    if (response.ok && text) {
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`Bright Data API error: invalid JSON - ${text.slice(0, 200)}`);
      }
    }

    lastError = !response.ok
      ? `${response.status} - ${text || brdError || 'empty body'}`
      : brdError || 'empty body';
    // Retry only transient failures (captcha / empty body); real 4xx config errors won't self-heal
    if (!response.ok && response.status < 500) break;
  }

  throw new Error(`Bright Data API error: ${lastError}`);
}

export function getExaClient() {
  return {
    websets: {
      create: createBrightDataWebset,
      get: async (websetId: string) => {
        const items = await getWebsetItems(websetId);
        return {
          id: websetId,
          status: 'idle',
          searches: [
            {
              progress: {
                found: items.length,
                analyzed: items.length,
                completion: 100,
              },
            },
          ],
        };
      },
      waitUntilIdle: waitForWebset,
      delete: deleteWebset,
      items: {
        listAll: async function* (websetId: string) {
          const items = await getWebsetItems(websetId);
          yield* items;
        },
      },
      searches: {
        create: async (_websetId: string, params: { query: string; count?: number; criteria?: Array<{ description: string }> }) => {
          return createBrightDataWebset({
            search: {
              query: params.query,
              count: params.count,
              criteria: params.criteria,
            },
          });
        },
      },
    },
  };
}

export interface CreateWebsetParams {
  query: string;
  count?: number;
  criteria?: string[];
  enrichments?: Array<{
    description: string;
    format?: 'text' | 'email' | 'phone' | 'number' | 'date' | 'options';
  }>;
}

export interface WebsetSearchResult {
  websetId: string;
  items: ExaWebsetItem[];
  totalItems: number;
}

interface BrightDataOrganicResult {
  link?: string;
  url?: string;
  title?: string;
  description?: string;
  snippet?: string;
  display_link?: string;
  source?: string;
}

interface BrightDataSerpResponse {
  organic?: BrightDataOrganicResult[];
  general?: {
    query?: string;
  };
}

const inMemoryResults = new Map<string, ExaWebsetItem[]>();

export function canonicalizeLeadUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  if (host === 'google.com' || host.endsWith('.google.com')) return null;
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|srsltid|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = host;
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  if ([...url.searchParams].length === 0) url.search = '';
  return url.toString();
}

function buildGoogleSearchUrl(params: CreateWebsetParams): string {
  const { country } = getBrightDataConfig();
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('q', params.query);
  url.searchParams.set('gl', country.toLowerCase());
  url.searchParams.set('hl', 'en');
  url.searchParams.set('brd_json', '1');
  return url.toString();
}

function normalizeSerpResults(websetId: string, response: BrightDataSerpResponse): ExaWebsetItem[] {
  const seen = new Set<string>();
  return (response.organic || [])
    .map((item, index) => {
      const url = canonicalizeLeadUrl(item.link || item.url);
      if (!url || seen.has(url)) return null;
      seen.add(url);
      return {
        id: `${websetId}-${index}`,
        properties: {
          url,
          title: item.title,
          description: item.description || item.snippet,
          display_link: item.display_link,
          source: item.source,
        },
        enrichments: {},
      };
    })
    .filter(Boolean) as ExaWebsetItem[];
}

async function createBrightDataWebset(websetParams: any): Promise<{ id: string }> {
  const { serpZone } = getBrightDataConfig();
  const search = websetParams.search || {};
  const criteria = Array.isArray(search.criteria)
    ? search.criteria.map((criterion: { description?: string } | string) =>
        typeof criterion === 'string' ? criterion : criterion.description || ''
      )
    : [];

  const params: CreateWebsetParams = {
    query: search.query,
    count: search.count,
    criteria,
    enrichments: websetParams.enrichments,
  };

  const websetId = `brightdata_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const response = await brightDataRequest<BrightDataSerpResponse>({
    zone: serpZone,
    url: buildGoogleSearchUrl(params),
    format: 'raw',
  });

  inMemoryResults.set(websetId, normalizeSerpResults(websetId, response));
  return { id: websetId };
}

/**
 * Create a new Exa Webset with search and optional enrichments
 */
export async function createWebset(params: CreateWebsetParams): Promise<string> {
  const webset = await createBrightDataWebset({
    search: {
      query: params.query,
      count: params.count || 25,
      criteria: params.criteria?.map((c) => ({ description: c })),
    },
    enrichments: params.enrichments,
  });
  return webset.id;
}

/**
 * Wait for a webset to complete processing
 */
export async function waitForWebset(websetId: string, timeoutMs = 300000): Promise<void> {
  void websetId;
  void timeoutMs;
}

/**
 * Get all items from a webset
 */
export async function getWebsetItems(websetId: string): Promise<ExaWebsetItem[]> {
  return inMemoryResults.get(websetId) || [];
}

/**
 * Extract and normalize data from a webset item
 */
function extractItemData(item: any): ExaWebsetItem {
  const data = item.model_dump ? item.model_dump() : item;

  // Ensure URLs are strings
  if (data.properties?.url) {
    data.properties.url = String(data.properties.url);
  }

  return {
    id: data.id,
    properties: data.properties || {},
    enrichments: data.enrichments || {},
  };
}

/**
 * Create a webset search for influencer/creator discovery with email enrichment
 */
export async function searchInfluencers(params: {
  query: string;
  count?: number;
  criteria?: string[];
  includeEmail?: boolean;
}): Promise<WebsetSearchResult> {
  const enrichments: CreateWebsetParams['enrichments'] = [];

  if (params.includeEmail !== false) {
    enrichments.push({
      description: 'Find the email address for this person or creator',
      format: 'email',
    });
  }

  // Also extract follower count if available
  enrichments.push({
    description: 'Extract the follower or subscriber count if visible',
    format: 'number',
  });

  const websetId = await createWebset({
    query: params.query,
    count: params.count || 25,
    criteria: params.criteria,
    enrichments,
  });

  // Wait for completion
  await waitForWebset(websetId);

  // Get results
  const items = await getWebsetItems(websetId);

  return {
    websetId,
    items,
    totalItems: items.length,
  };
}

/**
 * Refresh an existing webset with more results
 */
export async function refreshWebset(
  websetId: string,
  query: string,
  additionalCount: number,
  criteria?: string[]
): Promise<void> {
  const existingItems = await getWebsetItems(websetId);
  const newCount = existingItems.length + additionalCount;
  const nextWebsetId = await createWebset({
    query,
    count: newCount,
    criteria,
  });
  inMemoryResults.set(websetId, await getWebsetItems(nextWebsetId));
}

/**
 * Delete a webset
 */
export async function deleteWebset(websetId: string): Promise<void> {
  inMemoryResults.delete(websetId);
}
