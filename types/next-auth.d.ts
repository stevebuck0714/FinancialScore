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
  }
}


