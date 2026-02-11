'use client';

import React, { useCallback, useEffect, useState } from 'react';

const DOCUMENTS: { file: string; title: string }[] = [
  { file: 'Privacy_Policy.docx', title: 'Privacy Policy' },
  { file: 'Sample API Integration questionnaire.docx', title: 'Sample API Integration Questionnaire' },
  { file: 'SECURITY_FOR_STAKEHOLDERS.docx', title: 'Security for Stakeholders' },
  { file: 'Getting Started Guide.docx', title: 'Getting Started Guide' },
  { file: 'USER_MANUAL.docx', title: 'User Manual' },
];

const QUESTIONNAIRE_FILE = 'Sample API Integration questionnaire.docx';

/** Injects an input row after every paragraph and list item (all rows under sub-headers). */
function injectQuestionnaireInputs(html: string): string {
  if (typeof document === 'undefined') return html;
  const div = document.createElement('div');
  div.innerHTML = html;
  const nodes = div.querySelectorAll('p, li');
  nodes.forEach((el) => {
    const wrap = document.createElement('div');
    wrap.className = 'questionnaire-input-wrap';
    const textarea = document.createElement('textarea');
    textarea.className = 'questionnaire-input';
    textarea.placeholder = 'Your response';
    textarea.rows = 2;
    wrap.appendChild(textarea);
    el.parentNode?.insertBefore(wrap, el.nextSibling);
  });
  return div.innerHTML;
}

export default function DocumentationTab() {
  const [openDoc, setOpenDoc] = useState<{ file: string; title: string } | null>(null);
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDoc = useCallback(async (file: string) => {
    setLoading(true);
    setError(null);
    setHtml('');
    try {
      const res = await fetch(`/api/docs/view?file=${encodeURIComponent(file)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to load document');
      }
      const data = await res.json();
      let content = data?.html ?? '';
      if (file === QUESTIONNAIRE_FILE) {
        content = injectQuestionnaireInputs(content);
      }
      setHtml(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (openDoc) loadDoc(openDoc.file);
  }, [openDoc, loadDoc]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div style={{ maxWidth: '800px', padding: '24px' }}>
      <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '20px' }}>
        Reference documentation. Click a title to open the document; use Print to print.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {DOCUMENTS.map((doc) => (
          <li
            key={doc.file}
            style={{
              padding: '12px 16px',
              marginBottom: '8px',
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
            }}
          >
            <button
              type="button"
              onClick={() => setOpenDoc(doc)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: '#667eea',
                fontWeight: 600,
                fontSize: '15px',
                cursor: 'pointer',
                textAlign: 'left',
                textDecoration: 'underline',
              }}
            >
              {doc.title}
            </button>
          </li>
        ))}
      </ul>

      {/* Document viewer modal */}
      {openDoc && (
        <div
          className="document-viewer-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            boxSizing: 'border-box',
          }}
          onClick={(e) => e.target === e.currentTarget && setOpenDoc(null)}
        >
          <div
            className="document-viewer-modal no-print"
            style={{
              background: 'white',
              borderRadius: '12px',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="no-print"
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
                {openDoc.title}
              </h2>
              <div style={{ display: 'flex', gap: '8px' }}>
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
                <button
                  type="button"
                  onClick={() => setOpenDoc(null)}
                  style={{
                    padding: '8px 16px',
                    background: '#e2e8f0',
                    color: '#475569',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                padding: '24px',
              }}
            >
              {loading && <div style={{ color: '#64748b' }}>Loading…</div>}
              {error && <div style={{ color: '#b91c1c' }}>{error}</div>}
              {!loading && !error && html && (
                <div
                  className="document-print-content"
                  style={{
                    fontFamily: 'inherit',
                    fontSize: '15px',
                    lineHeight: 1.6,
                    color: '#334155',
                  }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .questionnaire-input-wrap { margin: 8px 0 16px 0; }
            .questionnaire-input {
              width: 100%;
              max-width: 100%;
              padding: 10px 12px;
              font-size: 14px;
              font-family: inherit;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              box-sizing: border-box;
            }
            .questionnaire-input:focus {
              outline: none;
              border-color: #667eea;
              box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
            }
            @media print {
              body * { visibility: hidden; }
              .document-viewer-overlay, .document-viewer-overlay * { visibility: visible; }
              .document-viewer-overlay { position: fixed; inset: 0; background: white; padding: 0; }
              .document-viewer-modal .no-print { display: none !important; }
              .document-print-content { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
              .questionnaire-input { border: 1px solid #ccc; background: #fafafa; }
            }
          `,
        }}
      />
    </div>
  );
}
