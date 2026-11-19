import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      userType?: string;
      companyRole?: string;
      sidebarAccess?: unknown;
      companyId?: string;
      consultantId?: string;
      isPrimaryContact?: boolean;
      mfaEnabled?: boolean;
      mfaPending?: boolean;
      demoCompany?: boolean;
      demoExpired?: boolean;
      demoExpiresAt?: string;
      accessibleCompanies?: Array<{
        companyId: string;
        name: string;
        companyRole?: string | null;
        sidebarAccess?: unknown;
      }>;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    userType?: string;
    companyRole?: string;
    sidebarAccess?: unknown;
    companyId?: string;
    consultantId?: string;
    isPrimaryContact?: boolean;
    mfaEnabled?: boolean;
    mfaPending?: boolean;
    demoCompany?: boolean;
    demoExpired?: boolean;
    demoExpiresAt?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
    userType?: string;
    companyRole?: string;
    sidebarAccess?: unknown;
    companyId?: string;
    consultantId?: string;
    isPrimaryContact?: boolean;
    mfaEnabled?: boolean;
    /** Signed in with a password but MFA not yet confirmed; the proxy blocks data APIs. */
    mfaPending?: boolean;
    demoCompany?: boolean;
    demoExpired?: boolean;
    demoExpiresAt?: string | null;
  }
}


