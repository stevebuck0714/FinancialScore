'use client';

import React, { useCallback, useEffect, useState } from 'react';

const VALUE_PROPOSITION_FILE = 'Corelytics Value proposition.docx';

const VALUE_PROP_TITLE = 'Corelytics supports business consultants by turning "data wrangling + slide-building" into "insight + action."';

function wrapTitleInStyledSpan(rawHtml: string): string {
  if (!rawHtml) return rawHtml;
  // Match title with straight or curly quotes (Word often uses \u201C \u201D)
  const straight = VALUE_PROP_TITLE;
  let n = 0;
  const curly = straight.replace(/"/g, () => (n++ % 2 === 0 ? '\u201C' : '\u201D'));
  const variants = [straight, curly];
  let out = rawHtml;
  for (const v of variants) {
    if (out.includes(v)) {
      out = out.replace(v, `<span class="value-prop-title">${v}</span>`);
      break;
    }
  }
  return out;
}

export default function ValuePropositionTab() {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDoc = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/docs/view?file=${encodeURIComponent(VALUE_PROPOSITION_FILE)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to load document');
      }
      const data = await res.json();
      setHtml(wrapTitleInStyledSpan(data?.html ?? ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDoc();
  }, [loadDoc]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '24px', color: '#64748b' }}>
        Loading value proposition…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: '24px', color: '#b91c1c' }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', padding: '24px' }}>
      <div
        className="value-prop-print-hide"
        style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}
      >
        <button
          type="button"
          onClick={handlePrint}
          style={{
            padding: '8px 16px',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Print
        </button>
      </div>
      <div
        className="value-prop-content document-print-content"
        style={{
          padding: '24px',
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          fontFamily: 'inherit',
          fontSize: '15px',
          lineHeight: 1.6,
          color: '#334155',
        }}
        dangerouslySetInnerHTML={{ __html: html || '<p>No content in document.</p>' }}
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .value-prop-title {
              font-size: 1.5rem;
              font-weight: 700;
              display: block;
              margin-bottom: 0.5em;
            }
            @media print {
              .value-prop-print-hide { display: none !important; }
              .value-prop-content { border: none; padding: 0; }
              .value-prop-title { font-size: 1.5rem; font-weight: 700; }
            }
          `,
        }}
      />
    </div>
  );
}
