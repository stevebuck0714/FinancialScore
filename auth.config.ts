import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyPassword } from './lib/auth';
import { isDemoCompany, isDemoExpired, shouldBypassMfaForDemo } from './lib/demo-access';
import { isCustomerProductionMfaHostname, isMfaDisabledByEnv, requestHostname } from './lib/mfa-app-scope';
import { findAuthUserByEmail } from './lib/auth-user-query';

export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: {
    signIn: '/',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const normalizedEmail = String(credentials.email).toLowerCase().trim();
          const user = await findAuthUserByEmail(normalizedEmail);

          if (!user) {
            return null;
          }

          if (!user.passwordHash) {
            console.warn('🔐 NextAuth authorize - Missing password hash for user:', user.email);
            return null;
          }

          const isValidPassword = await verifyPassword(
            credentials.password as string,
            user.passwordHash
          );

          if (!isValidPassword) {
            return null;
          }

          // A temporary password only unlocks /api/auth/initial-password; no session until it is replaced.
          if (user.mustChangePassword) {
            return null;
          }

          // For consultant users, get consultantId from either:
          // 1. primaryConsultant relation (if they're the primary contact)
          // 2. consultantId field (if they're a team member)
          const consultantId = user.primaryConsultant?.id || user.consultantId;

          console.log('🔐 NextAuth authorize - User data:', {
            email: user.email,
            role: user.role,
            userType: user.userType,
            companyRole: user.companyRole
          });

          const demoCompany = isDemoCompany(user.company);
          const demoExpired = isDemoExpired(user.company);
          // A password alone never unlocks data on the MFA host; /api/auth/login or the
          // MFA routes clear this once the second factor (or a trusted device) is confirmed.
          const mfaPending =
            isCustomerProductionMfaHostname(requestHostname(request)) &&
            !isMfaDisabledByEnv() &&
            !shouldBypassMfaForDemo(user.company);

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            userType: user.userType,
            companyRole: user.companyRole,
            companyId: user.companyId,
            consultantId: consultantId,
            isPrimaryContact: user.isPrimaryContact,
            mfaEnabled: user.mfaEnabled, // Pass MFA status to session
            mfaPending,
            demoCompany,
            demoExpired,
            demoExpiresAt: user.company?.nextBillingDate?.toISOString() || null,
          };
        } catch (error) {
          console.error('❌ NextAuth authorize error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.userType = user.userType;
        token.companyRole = user.companyRole;
        token.companyId = user.companyId;
        token.consultantId = user.consultantId;
        token.isPrimaryContact = user.isPrimaryContact;
        token.mfaEnabled = user.mfaEnabled;
        token.mfaPending = Boolean(user.mfaPending);
        token.demoCompany = user.demoCompany;
        token.demoExpired = user.demoExpired;
        token.demoExpiresAt = user.demoExpiresAt;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.userType = token.userType as string | undefined;
        session.user.companyRole = token.companyRole as string | undefined;
        session.user.companyId = token.companyId as string | undefined;
        session.user.consultantId = token.consultantId as string | undefined;
        session.user.isPrimaryContact = token.isPrimaryContact as boolean | undefined;
        session.user.mfaEnabled = token.mfaEnabled as boolean | undefined;
        session.user.mfaPending = Boolean(token.mfaPending);
        session.user.demoCompany = token.demoCompany as boolean | undefined;
        session.user.demoExpired = token.demoExpired as boolean | undefined;
        session.user.demoExpiresAt = token.demoExpiresAt as string | undefined;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
    updateAge: 60 * 60, // Refresh session every 1 hour of activity
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};


