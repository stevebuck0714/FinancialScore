'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { FinancialDataProvider } from './contexts/FinancialDataContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <FinancialDataProvider>
        {children}
      </FinancialDataProvider>
    </SessionProvider>
  );
}


