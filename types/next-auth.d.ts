import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      userType?: string;
      companyId?: string;
      consultantId?: string;
      isPrimaryContact?: boolean;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    userType?: string;
    companyId?: string;
    consultantId?: string;
    isPrimaryContact?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
    userType?: string;
    companyId?: string;
    consultantId?: string;
    isPrimaryContact?: boolean;
  }
}


