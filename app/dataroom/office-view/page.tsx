'use client';

import { use } from 'react';

import Link from 'next/link';

type OfficeViewPageProps = {
  searchParams: Promise<{
    src?: string;
    name?: string;
  }>;
};

function isSafeOfficeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!(parsed.protocol === 'https:' || parsed.protocol === 'http:')) return false;
    const lowerPath = parsed.pathname.toLowerCase();
    return (
      lowerPath.endsWith('.doc') ||
      lowerPath.endsWith('.docx') ||
      lowerPath.endsWith('.xls') ||
      lowerPath.endsWith('.xlsx') ||
      lowerPath.endsWith('.ppt') ||
      lowerPath.endsWith('.pptx')
    );
  } catch {
    return false;
  }
}

export default function OfficeViewPage(props: OfficeViewPageProps) {
  const searchParams = use(props.searchParams);
  const src = String(searchParams?.src || '').trim();
  const name = String(searchParams?.name || 'Document').trim();
  const valid = isSafeOfficeUrl(src);

  if (!valid) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fafc', padding: '24px' }}>
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px', maxWidth: '560px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: '0 0 8px 0' }}>Unable to open document</h1>
          <p style={{ fontSize: '14px', color: '#475569', margin: 0 }}>
            The document link is missing or invalid. Please return to DataRoom and try again.
          </p>
        </div>
      </main>
    );
  }

  const gviewUrl = `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(src)}`;

  return (
    <main style={{ minHeight: '100vh', background: '#0f172a' }}>
      <div
        style={{
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          borderBottom: '1px solid #334155',
          background: '#111827',
          color: '#e2e8f0',
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '12px' }}>
          {name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#e2e8f0',
              textDecoration: 'none',
              border: '1px solid #475569',
              borderRadius: '6px',
              padding: '6px 10px',
            }}
          >
            Open Original
          </a>
          <Link
            href="/"
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#e2e8f0',
              textDecoration: 'none',
              border: '1px solid #475569',
              borderRadius: '6px',
              padding: '6px 10px',
            }}
          >
            Close
          </Link>
        </div>
      </div>
      <iframe
        src={gviewUrl}
        title={name}
        style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', background: '#0f172a' }}
      />
    </main>
  );
}

