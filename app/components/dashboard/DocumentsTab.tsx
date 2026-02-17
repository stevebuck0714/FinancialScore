'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';

type DocCategory = 'LOAN_DOCUMENTS' | 'FINANCING_DOCUMENTS' | 'LEGAL_AND_REGULATORY' | 'OTHER';

type CompanyDocument = {
  id: string;
  companyId: string;
  category: DocCategory;
  originalFileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  extractionStatus: 'PENDING' | 'DONE' | 'FAILED' | 'NO_TEXT' | string;
  extractionError: string | null;
  createdAt: string;
};

const CATEGORY_META: Array<{ id: DocCategory; label: string }> = [
  { id: 'LOAN_DOCUMENTS', label: 'Loan Documents' },
  { id: 'FINANCING_DOCUMENTS', label: 'Financing Documents' },
  { id: 'LEGAL_AND_REGULATORY', label: 'Legal and Regulatory' },
  { id: 'OTHER', label: 'Other' },
];

function formatBytes(n: number | null) {
  if (!n || n <= 0) return '';
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function statusBadge(status: string) {
  const s = String(status || '').toUpperCase();
  if (s === 'DONE') return { label: 'Ready', bg: '#dcfce7', fg: '#166534', border: '#86efac' };
  if (s === 'PENDING') return { label: 'Processing', bg: '#e0f2fe', fg: '#075985', border: '#7dd3fc' };
  if (s === 'NO_TEXT') return { label: 'No text (scanned PDF?)', bg: '#fff7ed', fg: '#9a3412', border: '#fed7aa' };
  if (s === 'FAILED') return { label: 'Failed', bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' };
  return { label: s || 'Unknown', bg: '#f1f5f9', fg: '#334155', border: '#cbd5e1' };
}

export default function DocumentsTab(props: { selectedCompanyId: string }) {
  const { selectedCompanyId } = props;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<DocCategory>('LOAN_DOCUMENTS');
  const [uploading, setUploading] = useState(false);

  async function load() {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company-documents?companyId=${encodeURIComponent(selectedCompanyId)}`);
      const contentType = res.headers.get('content-type') || '';
      const raw = await res.text();
      if (!contentType.includes('application/json')) {
        throw new Error(`Failed to load documents (${res.status}): non-JSON response`);
      }
      const data = JSON.parse(raw);
      if (data?.migrationRequired) {
        throw new Error(
          `Documents are not configured in this environment (missing DB migration). Run: ${String(
            (data?.manualMigrations || []).join(' , ')
          )}`
        );
      }
      if (!res.ok) throw new Error(data?.error || 'Failed to load documents');
      setDocuments(Array.isArray(data?.documents) ? data.documents : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load documents');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  const docsByCategory = useMemo(() => {
    const map: Record<string, CompanyDocument[]> = {};
    for (const c of CATEGORY_META) map[c.id] = [];
    for (const d of documents) {
      const key = d.category || 'OTHER';
      if (!map[key]) map[key] = [];
      map[key].push(d);
    }
    return map;
  }, [documents]);

  async function doUpload() {
    const input = fileInputRef.current;
    const file = input?.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      // 1) Upload directly to Vercel Blob (supports large files).
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/company-documents/upload',
        clientPayload: JSON.stringify({
          companyId: selectedCompanyId,
          category,
          originalFileName: file.name,
        }),
      });

      // 2) Register in DB (also extracts text). This works locally even when
      // Vercel's onUploadCompleted webhook can't hit localhost.
      const res = await fetch('/api/company-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          category,
          originalFileName: file.name,
          blob,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to register document');

      if (input) input.value = '';
      await load();
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function doDelete(id: string) {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/company-documents/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to delete');
      await load();
    } catch (e: any) {
      alert(e?.message || 'Failed to delete');
    }
  }

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '14px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Documents</h2>
          <div style={{ marginTop: '4px', fontSize: '13px', color: '#64748b' }}>
            Upload PDF or DOCX documents. Ask Corelytics can use these as context.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as DocCategory)}
            disabled={uploading}
            style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white' }}
            aria-label="Document category"
          >
            {CATEGORY_META.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={uploading}
          />

          <button
            onClick={doUpload}
            disabled={uploading}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: 'none',
              background: uploading ? '#94a3b8' : '#0ea5e9',
              color: 'white',
              fontWeight: 800,
              cursor: uploading ? 'not-allowed' : 'pointer',
            }}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>

          <button
            onClick={load}
            disabled={loading || uploading}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              background: 'white',
              color: '#0f172a',
              fontWeight: 800,
              cursor: loading || uploading ? 'not-allowed' : 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '12px', color: '#64748b' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gap: '14px' }}>
          {CATEGORY_META.map((cat) => {
            const list = docsByCategory[cat.id] || [];
            return (
              <div key={cat.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '10px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 900, color: '#0f172a' }}>
                  {cat.label} <span style={{ color: '#64748b', fontWeight: 800, fontSize: '12px' }}>({list.length})</span>
                </div>
                {list.length === 0 ? (
                  <div style={{ padding: '12px', color: '#64748b', fontSize: '13px' }}>No documents.</div>
                ) : (
                  <div style={{ display: 'grid' }}>
                    {list.map((d) => {
                      const badge = statusBadge(d.extractionStatus);
                      return (
                        <div key={d.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderTop: '1px solid #f1f5f9' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {d.originalFileName}
                            </div>
                            <div style={{ marginTop: '2px', fontSize: '12px', color: '#64748b', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                              <span>{new Date(d.createdAt).toLocaleString()}</span>
                              {d.sizeBytes ? <span>{formatBytes(d.sizeBytes)}</span> : null}
                            </div>
                            {d.extractionStatus === 'FAILED' && d.extractionError ? (
                              <div style={{ marginTop: '6px', fontSize: '12px', color: '#991b1b' }}>{d.extractionError}</div>
                            ) : null}
                          </div>

                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                            <div style={{ padding: '4px 8px', borderRadius: '999px', border: `1px solid ${badge.border}`, background: badge.bg, color: badge.fg, fontSize: '12px', fontWeight: 900 }}>
                              {badge.label}
                            </div>
                            <button
                              onClick={() => window.open(`/api/company-documents/${d.id}/open`, '_blank', 'noreferrer')}
                              style={{
                                padding: '8px 10px',
                                borderRadius: '10px',
                                border: '1px solid #e2e8f0',
                                background: 'white',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              Open
                            </button>
                            <button
                              onClick={() => doDelete(d.id)}
                              style={{
                                padding: '8px 10px',
                                borderRadius: '10px',
                                border: '1px solid #fecaca',
                                background: '#fff',
                                color: '#991b1b',
                                fontWeight: 900,
                                cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

