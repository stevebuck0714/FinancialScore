export function normalizeSessionUser(user: any) {
  return {
    ...user,
    role: String(user?.role || '').toLowerCase(),
    userType: user?.userType ? String(user.userType).toLowerCase() : user?.userType,
    consultantCompanyName: user?.consultantCompanyName,
    consultantType: user?.consultantType,
    consultantId: user?.consultantId,
    isPrimaryContact: user?.isPrimaryContact,
    companyRole: user?.companyRole,
    sidebarAccess: user?.sidebarAccess ?? null,
    operationalDashboardAccess: user?.operationalDashboardAccess ?? null,
  };
}

export function persistLoggedInUser(user: any) {
  const normalizedUser = normalizeSessionUser(user);
  if (typeof window === 'undefined') return normalizedUser;
  localStorage.setItem('fs_currentUser', JSON.stringify(normalizedUser));
  sessionStorage.setItem(
    'pendingLogin',
    JSON.stringify({ user: normalizedUser, timestamp: Date.now() })
  );
  return normalizedUser;
}

export function enterAppAfterLogin() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.delete('sessionExpired');
  params.delete('demoExpired');
  const query = params.toString();
  window.location.assign(query ? `/?${query}` : '/');
}
