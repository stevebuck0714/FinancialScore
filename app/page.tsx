'use client';

import dynamic from 'next/dynamic';

const FinancialScoreApp = dynamic(() => import('./FinancialScoreApp'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#e8edf3',
        color: '#475569',
        fontSize: '16px',
        fontWeight: 600,
      }}
    >
      Loading Corelytics…
    </div>
  ),
});

export default function HomePage() {
  return <FinancialScoreApp />;
}
