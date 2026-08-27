import { isSectorMasterTab } from '@/lib/operations/sector-master-tabs';

export type OperationalHubCustomTab = {
  id: string;
  key: string;
  label: string;
  createdAt: string;
  createdByCompanyId: string;
};

export type OperationalHubCustomReport = {
  id: string;
  label: string;
  tabKey: string;
  dataType: string;
  scope: 'company' | 'global';
  createdAt: string;
  createdByCompanyId: string;
};

export type HubTabSource = 'master' | 'current' | 'company';

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unionById<T extends { id?: string }>(current: T[], incoming?: T[]): T[] {
  if (!Array.isArray(incoming)) return current;
  const byId = new Map<string, T>();
  current.forEach((entry) => {
    const id = String(entry?.id || '').trim();
    if (id) byId.set(id, entry);
  });
  incoming.forEach((entry) => {
    const id = String(entry?.id || '').trim();
    if (!id) return;
    byId.set(id, { ...(byId.get(id) || {}), ...entry });
  });
  return Array.from(byId.values());
}

export function parseOperationalHubConfig(value: unknown): Record<string, any> {
  return isPlainObject(value) ? value : {};
}

export function parseOperationalHubCustomTabs(value: unknown): OperationalHubCustomTab[] {
  const config = parseOperationalHubConfig(value);
  const rows = Array.isArray(config.customTabs) ? config.customTabs : [];
  return rows
    .map((entry: any) => {
      const id = String(entry?.id || '').trim();
      const key = String(entry?.key || '').trim();
      const label = String(entry?.label || '').trim();
      if (!id || !key || !label) return null;
      return {
        id,
        key,
        label,
        createdAt: String(entry?.createdAt || ''),
        createdByCompanyId: String(entry?.createdByCompanyId || ''),
      } as OperationalHubCustomTab;
    })
    .filter(Boolean) as OperationalHubCustomTab[];
}

export function parseAssignedCompanyReports(value: unknown): string[] {
  const config = parseOperationalHubConfig(value);
  const rows = Array.isArray(config.assignedCompanyReports) ? config.assignedCompanyReports : [];
  const keys = new Set<string>();
  rows.forEach((entry) => {
    const key = String(entry || '').trim();
    if (key) keys.add(key);
  });
  return Array.from(keys);
}

function unionKeys(current: string[], incoming?: string[]): string[] {
  if (!Array.isArray(incoming)) return current;
  const keys = new Set(current);
  incoming.forEach((entry) => {
    const key = String(entry || '').trim();
    if (key) keys.add(key);
  });
  return Array.from(keys);
}

export function parseOperationalHubCustomReports(value: unknown): OperationalHubCustomReport[] {
  const config = parseOperationalHubConfig(value);
  const rows = Array.isArray(config.customReports) ? config.customReports : [];
  return rows
    .map((entry: any) => {
      const id = String(entry?.id || '').trim();
      const label = String(entry?.label || '').trim();
      const tabKey = String(entry?.tabKey || '').trim();
      const dataType = String(entry?.dataType || '').trim();
      if (!id || !label || !tabKey || !dataType) return null;
      return {
        id,
        label,
        tabKey,
        dataType,
        scope: entry?.scope === 'global' ? 'global' : 'company',
        createdAt: String(entry?.createdAt || ''),
        createdByCompanyId: String(entry?.createdByCompanyId || ''),
      } as OperationalHubCustomReport;
    })
    .filter(Boolean) as OperationalHubCustomReport[];
}

export function slugifyCompanyTabKey(label: string): string {
  const base = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base ? `co_${base}` : '';
}

export function uniqueCompanyTabKey(label: string, reservedKeys: string[]): string {
  const reserved = new Set(reservedKeys.map((key) => String(key || '').trim()).filter(Boolean));
  const base = slugifyCompanyTabKey(label) || `co_tab_${Date.now().toString(36)}`;
  if (!reserved.has(base)) return base;
  let index = 2;
  while (reserved.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

export function getHubTabSource(args: {
  sectorCategory?: string | null;
  moduleKey: string;
  customTabKeys?: string[];
}): HubTabSource {
  const moduleKey = String(args.moduleKey || '').trim();
  if ((args.customTabKeys || []).includes(moduleKey)) return 'company';
  if (isSectorMasterTab(args.sectorCategory, moduleKey)) return 'master';
  return 'current';
}

export function mergeOperationalHubConfig(
  current: unknown,
  incoming: unknown
): Record<string, any> {
  const base = parseOperationalHubConfig(current);
  const next = parseOperationalHubConfig(incoming);
  const baseSections = isPlainObject(base.sections) ? base.sections : {};
  const nextSections = isPlainObject(next.sections) ? next.sections : {};
  return {
    ...base,
    ...next,
    sections: {
      ...baseSections,
      ...nextSections,
    },
    customReports: unionById(
      Array.isArray(base.customReports) ? base.customReports : [],
      Array.isArray(next.customReports) ? next.customReports : undefined
    ),
    customTabs: unionById(
      Array.isArray(base.customTabs) ? base.customTabs : [],
      Array.isArray(next.customTabs) ? next.customTabs : undefined
    ),
    assignedCompanyReports: unionKeys(
      parseAssignedCompanyReports(base),
      Array.isArray(next.assignedCompanyReports) ? next.assignedCompanyReports.map((entry: any) => String(entry || '')) : undefined
    ),
    updatedAt: String(next.updatedAt || new Date().toISOString()),
  };
}
