// A successful credential sign-in can return before the browser exposes the
// session cookie to the session endpoint, particularly after a cold deploy.
export async function waitForNextAuthSession(attempts = 10, delayMs = 250) {
  const { getSession } = await import('next-auth/react');
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const session = await getSession();
      if (session?.user) return session;
    } catch (error) {
      console.warn('NextAuth getSession attempt failed:', error);
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  return null;
}
