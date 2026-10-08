import { normalizeSessionUser } from './enter-app-after-login';

const ACCOUNT_MANAGER_LANDING_KEY = 'fs_accountManagerLandingPending';
const COMPANY_SWITCH_CHANNEL = 'fs-company-switch';

// Pure display preferences that hold no company data. Everything else in
// browser storage is treated as company-scoped and wiped on switch/logout.
const PRESERVED_LOCAL_STORAGE_KEYS = new Set(['fs_sidebarCollapsed']);

type CompanySwitchMessage = {
  type: 'company-switched';
  companyId: string;
  user: unknown;
};

export function isAccountManagerUser(user: any): boolean {
  return Boolean(user?.isAccountManager) && String(user?.role || '').toLowerCase() === 'user';
}

export function markAccountManagerLanding(user: any) {
  if (typeof window === 'undefined') return;
  const accountCount = Array.isArray(user?.accessibleCompanies) ? user.accessibleCompanies.length : 0;
  if (isAccountManagerUser(user) && (accountCount > 1 || !user?.companyId)) {
    sessionStorage.setItem(ACCOUNT_MANAGER_LANDING_KEY, '1');
  } else {
    sessionStorage.removeItem(ACCOUNT_MANAGER_LANDING_KEY);
  }
}

export function shouldLandOnMyAccounts(user: any): boolean {
  if (typeof window === 'undefined') return false;
  if (!isAccountManagerUser(user)) return false;
  // Account Managers have no Corelytics client company of their own, so with
  // nothing opened yet the only page they can use is My Accounts.
  if (!user?.companyId) return true;
  return sessionStorage.getItem(ACCOUNT_MANAGER_LANDING_KEY) === '1';
}

export function clearBrowserCompanyData() {
  if (typeof window === 'undefined') return;
  try {
    const localKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && !PRESERVED_LOCAL_STORAGE_KEYS.has(key)) localKeys.push(key);
    }
    localKeys.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.error('Failed to clear company data from localStorage', error);
  }
  try {
    sessionStorage.clear();
  } catch (error) {
    console.error('Failed to clear company data from sessionStorage', error);
  }
}

function writeFreshSession(user: any, companyId: string) {
  localStorage.setItem('fs_currentUser', JSON.stringify(user));
  localStorage.setItem('fs_selectedCompanyId', companyId);
}

function reloadIntoActiveCompany() {
  window.location.replace('/');
}

/**
 * Closes the current company completely and reopens the app in another one.
 * The server validates access and sets the active company; the browser then
 * drops every company-scoped cache and does a full page load so no in-memory
 * state or in-flight request from the previous company survives.
 */
export async function switchActiveCompany(companyId: string): Promise<void> {
  if (typeof window === 'undefined') return;

  const selectResponse = await fetch('/api/auth/select-company', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ companyId }),
  });
  const selectData = await selectResponse.json().catch(() => ({}));
  if (!selectResponse.ok) {
    throw new Error(selectData?.error || 'Failed to open this account');
  }

  const meResponse = await fetch('/api/auth/me', { cache: 'no-store' });
  const meData = await meResponse.json().catch(() => ({}));
  if (!meResponse.ok || !meData?.user) {
    throw new Error(meData?.error || 'Failed to load the selected account');
  }
  const user = normalizeSessionUser(meData.user);
  if (user.companyId !== companyId) {
    throw new Error('The selected account could not be activated');
  }

  clearBrowserCompanyData();
  writeFreshSession(user, companyId);

  try {
    const channel = new BroadcastChannel(COMPANY_SWITCH_CHANNEL);
    const message: CompanySwitchMessage = { type: 'company-switched', companyId, user };
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel is unavailable; other tabs pick up the change on their next load.
  }

  reloadIntoActiveCompany();
}

/**
 * Other open tabs still hold the previous company in memory. When any tab
 * switches companies, they reload immediately instead of continuing to show
 * or save data under the old company.
 */
export function subscribeToCompanySwitches(getCurrentCompanyId: () => string | null | undefined): () => void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(COMPANY_SWITCH_CHANNEL);
  channel.onmessage = (event: MessageEvent<CompanySwitchMessage>) => {
    const message = event.data;
    if (message?.type !== 'company-switched') return;
    if (getCurrentCompanyId() === message.companyId) return;
    writeFreshSession(message.user, message.companyId);
    reloadIntoActiveCompany();
  };
  return () => channel.close();
}
