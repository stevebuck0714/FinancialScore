/** True when the credentials are valid but still a temporary password that must be replaced. */
export async function requiresInitialPasswordChange(email: string, password: string): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/initial-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, currentPassword: password }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data?.passwordChangeRequired);
  } catch {
    return false;
  }
}
