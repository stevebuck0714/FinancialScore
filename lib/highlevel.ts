export const HIGHLEVEL_SOURCE_CODE = 'HIGHLEVEL_STANDARD';
export const HIGHLEVEL_LABEL = 'HighLevel';
export const HIGHLEVEL_API_BASE_URL = 'https://services.leadconnectorhq.com';
const HIGHLEVEL_API_VERSION = '2021-07-28';

export type HighLevelCredentials = { token: string; locationId: string };

export type HighLevelUser = { id: string; name?: string; firstName?: string; lastName?: string; email?: string };

export type HighLevelPipeline = { id: string; name?: string; stages?: Array<{ id: string; name?: string; position?: number }> };

export type HighLevelOpportunity = {
  id: string;
  name?: string;
  monetaryValue?: number | string | null;
  pipelineId?: string;
  pipelineStageId?: string;
  assignedTo?: string | null;
  status?: string;
  source?: string | null;
  lastStatusChangeAt?: string | null;
  lastStageChangeAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  contactId?: string | null;
  contact?: { id?: string; name?: string; companyName?: string | null } | null;
};

export type HighLevelContact = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  businessId?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  source?: string | null;
  type?: string | null;
  tags?: string[] | null;
  assignedTo?: string | null;
  dateAdded?: string | null;
  dateUpdated?: string | null;
};

export type HighLevelBusiness = {
  id: string;
  name?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  createdAt?: string | null;
};

export type HighLevelCalendar = { id: string; name?: string };

export type HighLevelEvent = {
  id: string;
  title?: string | null;
  calendarId?: string;
  appointmentStatus?: string | null;
  assignedUserId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  contactId?: string | null;
};

export type HighLevelTask = {
  id?: string;
  _id?: string;
  title?: string | null;
  completed?: boolean;
  dueDate?: string | null;
  assignedTo?: string | null;
  contactId?: string | null;
};

export function assertHighLevelCredentials(credentials: Partial<HighLevelCredentials> | null | undefined): asserts credentials is HighLevelCredentials {
  if (!String(credentials?.token || '').trim() || !String(credentials?.locationId || '').trim()) {
    throw new Error('HighLevel is not connected. Add the Private Integration Token and Location ID in Site Administration.');
  }
}

export async function highLevelRequest<T>(
  credentials: HighLevelCredentials,
  path: string,
  options: { query?: Record<string, string | number | undefined>; method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<T> {
  assertHighLevelCredentials(credentials);
  const url = new URL(path, HIGHLEVEL_API_BASE_URL);
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${credentials.token}`,
          Version: HIGHLEVEL_API_VERSION,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        cache: 'no-store',
      });
      const text = await response.text();
      if (response.status === 429 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      if (!response.ok) {
        const detail = text.replace(/\s+/g, ' ').trim().slice(0, 500);
        throw new Error(`HighLevel API returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }
      return (text ? JSON.parse(text) : {}) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('HighLevel API request timed out.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('HighLevel API rate limit exceeded.');
}

type CursorMeta = { startAfter?: number | string | null; startAfterId?: string | null; total?: number };

/** Lists that page with `startAfter` / `startAfterId` cursors (contacts, opportunities). */
async function fetchHighLevelCursorPages<T>(
  credentials: HighLevelCredentials,
  path: string,
  listKey: string,
  query: Record<string, string | number | undefined>,
  maxPages: number
): Promise<T[]> {
  const all: T[] = [];
  let cursor: CursorMeta = {};
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await highLevelRequest<Record<string, unknown> & { meta?: CursorMeta }>(credentials, path, {
      query: {
        ...query,
        limit: 100,
        ...(cursor.startAfterId ? { startAfterId: cursor.startAfterId, startAfter: cursor.startAfter ?? undefined } : {}),
      },
    });
    const rows = Array.isArray(payload[listKey]) ? (payload[listKey] as T[]) : [];
    all.push(...rows);
    const next = payload.meta || {};
    if (!rows.length || !next.startAfterId || next.startAfterId === cursor.startAfterId) break;
    if (typeof next.total === 'number' && all.length >= next.total) break;
    cursor = next;
  }
  return all;
}

export async function fetchHighLevelUsers(credentials: HighLevelCredentials): Promise<HighLevelUser[]> {
  const payload = await highLevelRequest<{ users?: HighLevelUser[] }>(credentials, '/users/', { query: { locationId: credentials.locationId } });
  return Array.isArray(payload.users) ? payload.users : [];
}

export async function fetchHighLevelPipelines(credentials: HighLevelCredentials): Promise<HighLevelPipeline[]> {
  const payload = await highLevelRequest<{ pipelines?: HighLevelPipeline[] }>(credentials, '/opportunities/pipelines', {
    query: { locationId: credentials.locationId },
  });
  return Array.isArray(payload.pipelines) ? payload.pipelines : [];
}

export function fetchHighLevelOpportunities(credentials: HighLevelCredentials, maxPages = 50): Promise<HighLevelOpportunity[]> {
  return fetchHighLevelCursorPages<HighLevelOpportunity>(credentials, '/opportunities/search', 'opportunities', {
    location_id: credentials.locationId,
  }, maxPages);
}

export function fetchHighLevelContacts(credentials: HighLevelCredentials, maxPages = 50): Promise<HighLevelContact[]> {
  return fetchHighLevelCursorPages<HighLevelContact>(credentials, '/contacts/', 'contacts', { locationId: credentials.locationId }, maxPages);
}

export async function fetchHighLevelBusinesses(credentials: HighLevelCredentials): Promise<HighLevelBusiness[]> {
  const payload = await highLevelRequest<{ businesses?: HighLevelBusiness[] }>(credentials, '/businesses/', {
    query: { locationId: credentials.locationId },
  });
  return Array.isArray(payload.businesses) ? payload.businesses : [];
}

export async function fetchHighLevelCalendars(credentials: HighLevelCredentials): Promise<HighLevelCalendar[]> {
  const payload = await highLevelRequest<{ calendars?: HighLevelCalendar[] }>(credentials, '/calendars/', {
    query: { locationId: credentials.locationId },
  });
  return Array.isArray(payload.calendars) ? payload.calendars : [];
}

/** Appointments on every calendar with a start time in [startMs, endMs). */
export async function fetchHighLevelAppointments(
  credentials: HighLevelCredentials,
  calendars: HighLevelCalendar[],
  startMs: number,
  endMs: number
): Promise<HighLevelEvent[]> {
  const events: HighLevelEvent[] = [];
  for (const calendar of calendars) {
    const payload = await highLevelRequest<{ events?: HighLevelEvent[] }>(credentials, '/calendars/events', {
      query: { locationId: credentials.locationId, calendarId: calendar.id, startTime: startMs, endTime: endMs },
    });
    events.push(...(Array.isArray(payload.events) ? payload.events.map((event) => ({ ...event, calendarId: event.calendarId || calendar.id })) : []));
  }
  return events;
}

export async function fetchHighLevelTasks(credentials: HighLevelCredentials, maxPages = 10): Promise<HighLevelTask[]> {
  const tasks: HighLevelTask[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await highLevelRequest<{ tasks?: HighLevelTask[] }>(credentials, `/locations/${encodeURIComponent(credentials.locationId)}/tasks/search`, {
      method: 'POST',
      body: { limit: 100, skip: page * 100 },
    });
    const rows = Array.isArray(payload.tasks) ? payload.tasks : [];
    tasks.push(...rows);
    if (rows.length < 100) break;
  }
  return tasks;
}

export function highLevelUserName(user: HighLevelUser | undefined): string {
  if (!user) return 'Unassigned';
  const name = String(user.name || [user.firstName, user.lastName].filter(Boolean).join(' ')).trim();
  return name || user.email || 'Unassigned';
}

export function highLevelContactName(contact: HighLevelContact): string {
  return String(contact.contactName || [contact.firstName, contact.lastName].filter(Boolean).join(' ')).trim();
}

/** Credentials stored on the operational connection (token + Location ID in metadata). */
export function highLevelCredentialsFromConnection(connection: { accessToken?: string | null; connectionMetadata?: unknown } | null | undefined): HighLevelCredentials | null {
  const metadata = connection?.connectionMetadata && typeof connection.connectionMetadata === 'object'
    ? connection.connectionMetadata as Record<string, any>
    : {};
  const token = String(connection?.accessToken || '').trim();
  const locationId = String(metadata?.highLevelSettings?.locationId || '').trim();
  return token && locationId ? { token, locationId } : null;
}
