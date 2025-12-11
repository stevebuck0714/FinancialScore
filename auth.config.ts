import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyPassword } from './lib/auth';
import prisma from './lib/prisma';

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            company: true,
            primaryConsultant: true
          }
        });

        if (!user) {
          return null;
        }

        const isValidPassword = await verifyPassword(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValidPassword) {
          return null;
        }

        // For consultant users, get consultantId from either:
        // 1. primaryConsultant relation (if they're the primary contact)
        // 2. consultantId field (if they're a team member)
        const consultantId = user.primaryConsultant?.id || user.consultantId;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          userType: user.userType,
          companyId: user.companyId,
          consultantId: consultantId,
          isPrimaryContact: user.isPrimaryContact
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.userType = user.userType;
        token.companyId = user.companyId;
        token.consultantId = user.consultantId;
        token.isPrimaryContact = user.isPrimaryContact;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.userType = token.userType as string | undefined;
        session.user.companyId = token.companyId as string | undefined;
        session.user.consultantId = token.consultantId as string | undefined;
        session.user.isPrimaryContact = token.isPrimaryContact as boolean | undefined;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
    updateAge: 60 * 60, // Refresh session every 1 hour of activity
  },
  secret: process.env.NEXTAUTH_SECRET,
};


