export const HUBSPOT_SOURCE_CODE = 'HUBSPOT_STANDARD';
export const HUBSPOT_API_BASE_URL = 'https://api.hubapi.com';

type HubSpotPage<T> = {
  results?: T[];
  paging?: { next?: { after?: string } };
};

export type HubSpotDeal = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  properties?: Record<string, string | null | undefined>;
};

export type HubSpotOwner = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

export function assertHubSpotToken(token: string | null | undefined): asserts token is string {
  if (!String(token || '').trim()) {
    throw new Error('HubSpot is not connected. Add the service key in Site Administration.');
  }
}

export async function fetchHubSpotPage<T>(
  token: string,
  path: string,
  searchParams: Record<string, string> = {}
): Promise<HubSpotPage<T>> {
  assertHubSpotToken(token);
  const url = new URL(path, HUBSPOT_API_BASE_URL);
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: 'no-store',
    });
    const text = await response.text();
    if (!response.ok) {
      const detail = text.replace(/\s+/g, ' ').trim().slice(0, 500);
      throw new Error(`HubSpot API returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    return text ? JSON.parse(text) as HubSpotPage<T> : {};
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('HubSpot API request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchHubSpotPages<T>(
  token: string,
  path: string,
  searchParams: Record<string, string> = {},
  maxPages = 10
): Promise<T[]> {
  const all: T[] = [];
  let after = '';
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await fetchHubSpotPage<T>(token, path, { ...searchParams, ...(after ? { after } : {}) });
    all.push(...(Array.isArray(payload.results) ? payload.results : []));
    after = String(payload.paging?.next?.after || '');
    if (!after) break;
  }
  return all;
}

/**
 * CRM search for one object type with `property` in [startMs, endMs). HubSpot caps a single
 * search at 10,000 results, so callers split long ranges into smaller windows.
 */
export async function searchHubSpotObjectsInRange<T>(
  token: string,
  objectType: string,
  params: { property: string; startMs: number; endMs: number; properties: string[]; maxResults?: number }
): Promise<{ results: T[]; truncated: boolean }> {
  assertHubSpotToken(token);
  const maxResults = Math.min(params.maxResults ?? 10_000, 10_000);
  const results: T[] = [];
  let after = '';
  while (results.length < maxResults) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let payload: HubSpotPage<T>;
    try {
      const response = await fetch(new URL(`/crm/v3/objects/${objectType}/search`, HUBSPOT_API_BASE_URL), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          filterGroups: [{
            filters: [
              { propertyName: params.property, operator: 'GTE', value: String(params.startMs) },
              { propertyName: params.property, operator: 'LT', value: String(params.endMs) },
            ],
          }],
          sorts: [{ propertyName: params.property, direction: 'ASCENDING' }],
          properties: params.properties,
          limit: 100,
          ...(after ? { after } : {}),
        }),
        signal: controller.signal,
        cache: 'no-store',
      });
      const text = await response.text();
      if (!response.ok) {
        const detail = text.replace(/\s+/g, ' ').trim().slice(0, 500);
        throw new Error(`HubSpot search returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }
      payload = text ? (JSON.parse(text) as HubSpotPage<T>) : {};
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('HubSpot search request timed out.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    results.push(...(Array.isArray(payload.results) ? payload.results : []));
    after = String(payload.paging?.next?.after || '');
    if (!after) return { results, truncated: false };
    // Search endpoints allow about 5 requests per second per account.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { results: results.slice(0, maxResults), truncated: true };
}

export function hubSpotOwnerName(owner: HubSpotOwner | undefined): string {
  if (!owner) return 'Unassigned';
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
  return name || owner.email || 'Unassigned';
}
