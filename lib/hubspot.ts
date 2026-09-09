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
    throw new Error('HubSpot is not connected. Add the private-app access token in Site Administration.');
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

export function hubSpotOwnerName(owner: HubSpotOwner | undefined): string {
  if (!owner) return 'Unassigned';
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
  return name || owner.email || 'Unassigned';
}
