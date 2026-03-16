'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';

interface DataRoomViewProps {
  selectedCompanyId: string;
  companyName: string;
}

type FolderDoc = {
  id: string;
  folderId: string;
  originalFileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  extractionStatus: string;
  scanStatus: string;
  uploadedByName: string;
  lastDownloadedByName: string | null;
  lastDownloadedAt: string | null;
  canDownload?: boolean;
  canManage?: boolean;
  downloadHistory?: Array<{
    downloadedByName: string | null;
    downloadedAt: string | null;
  }>;
};

type DataRoomFolder = {
  id: string;
  key: string;
  name: string;
  order: number;
  documents: FolderDoc[];
};

const ACCEPTED_FILES = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt';
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

function formatBytes(n: number | null) {
  if (!n || n <= 0) return '';
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleString();
}

export default function DataRoomView({ selectedCompanyId, companyName }: DataRoomViewProps) {
  const [folders, setFolders] = useState<DataRoomFolder[]>([]);
  const [capabilities, setCapabilities] = useState({
    view: true,
    download: true,
    upload: true,
    share: true,
    manage: true,
  });
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [workingDocId, setWorkingDocId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) || null,
    [folders, selectedFolderId],
  );
  const pendingDocCount = useMemo(
    () =>
      folders.reduce(
        (count, folder) =>
          count +
          folder.documents.filter(
            (doc) => {
              const status = String(doc.scanStatus || 'pending_scan').toLowerCase();
              return status === 'pending_scan' || status === 'scan_failed';
            },
          ).length,
        0,
      ),
    [folders],
  );

  const loadOverview = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dataroom/overview?companyId=${encodeURIComponent(selectedCompanyId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load DataRoom');
      const incoming = Array.isArray(data?.folders) ? data.folders : [];
      const incomingCapabilities =
        data?.capabilities && typeof data.capabilities === 'object'
          ? data.capabilities
          : null;
      if (incomingCapabilities) {
        setCapabilities({
          view: Boolean((incomingCapabilities as any).view),
          download: Boolean((incomingCapabilities as any).download),
          upload: Boolean((incomingCapabilities as any).upload),
          share: Boolean((incomingCapabilities as any).share),
          manage: Boolean((incomingCapabilities as any).manage),
        });
      }
      setFolders(incoming);
      if (!selectedFolderId && incoming.length > 0) {
        setSelectedFolderId(String(incoming[0].id));
      } else if (selectedFolderId && incoming.length > 0 && !incoming.some((f: any) => String(f.id) === selectedFolderId)) {
        setSelectedFolderId(String(incoming[0].id));
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load DataRoom');
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  const uploadToCurrentFolder = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !selectedFolderId) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      alert('File too large. Maximum file size is 100 MB.');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/company-documents/upload',
        clientPayload: JSON.stringify({
          companyId: selectedCompanyId,
          category: 'OTHER',
          originalFileName: file.name,
        }),
      });

      const registerRes = await fetch('/api/company-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          category: 'OTHER',
          originalFileName: file.name,
          blob,
        }),
      });
      const registerData = await registerRes.json();
      if (!registerRes.ok) {
        throw new Error(registerData?.error || 'Failed to register document');
      }

      const docId = String(registerData?.document?.id || '');
      if (!docId) throw new Error('Missing document ID after upload');

      const assignRes = await fetch('/api/dataroom/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          documentId: docId,
          folderId: selectedFolderId,
        }),
      });
      const assignData = await assignRes.json();
      if (!assignRes.ok) {
        throw new Error(assignData?.error || 'Failed to assign DataRoom folder');
      }

      // Best-effort auto-scan trigger after assignment.
      try {
        await fetch('/api/dataroom/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: selectedCompanyId,
            documentId: docId,
          }),
        });
      } catch {
        // Ignore trigger failures; user can run "Scan Pending" manually.
      }

      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadOverview();
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const removeFromDataRoom = async (documentId: string) => {
    if (!confirm('Remove this document from DataRoom folder index? (File remains in company documents)')) {
      return;
    }
    setWorkingDocId(documentId);
    setError(null);
    try {
      const res = await fetch(
        `/api/dataroom/documents?companyId=${encodeURIComponent(selectedCompanyId)}&documentId=${encodeURIComponent(documentId)}`,
        { method: 'DELETE' },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to remove from DataRoom index');
      await loadOverview();
    } catch (e: any) {
      setError(e?.message || 'Failed to remove document from DataRoom index');
    } finally {
      setWorkingDocId(null);
    }
  };

  const scanPending = async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch('/api/dataroom/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to run scan');
      await loadOverview();
    } catch (e: any) {
      setError(e?.message || 'Failed to run scan');
    } finally {
      setScanning(false);
    }
  };

  const scanStatusPill = (status: string) => {
    const s = String(status || '').toLowerCase();
    if (s === 'clean') {
      return { bg: '#dcfce7', fg: '#166534', label: 'clean' };
    }
    if (s === 'blocked') {
      return { bg: '#fee2e2', fg: '#991b1b', label: 'blocked' };
    }
    if (s === 'scan_failed') {
      return { bg: '#fff7ed', fg: '#9a3412', label: 'scan_failed' };
    }
    return { bg: '#e0f2fe', fg: '#0c4a6e', label: 'pending_scan' };
  };

  const openDocument = async (doc: FolderDoc) => {
    if (doc.canDownload === false) {
      alert('You do not have download access for this document.');
      return;
    }
    const scanStatus = String(doc.scanStatus || '').toLowerCase();
    if (scanStatus !== 'clean') {
      if (scanStatus === 'pending_scan') {
        alert('This document is pending malware scan. Click "Scan Pending" and try again.');
      } else if (scanStatus === 'scan_failed') {
        alert('This document scan failed. Click "Scan Pending" to retry scanning.');
      } else {
        alert('This document is quarantined and cannot be opened until scan status is clean.');
      }
      return;
    }
    window.open(`/api/company-documents/${doc.id}/open`, '_blank', 'noreferrer');
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <div
        style={{
          background: 'white',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0',
        }}
      >
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
          Corelytics DataRoom
        </h1>
        <p style={{ marginTop: '10px', color: '#475569', fontSize: '15px' }}>
          Secure document vault for {companyName || 'your company'}.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '16px', marginTop: '20px' }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '10px 12px', fontSize: '12px', fontWeight: 800, color: '#334155' }}>
              Diligence Folders
            </div>
            <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
              {folders.map((folder) => {
                const isActive = folder.id === selectedFolderId;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setSelectedFolderId(folder.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderBottom: '1px solid #f1f5f9',
                      background: isActive ? '#eff6ff' : 'white',
                      color: isActive ? '#1d4ed8' : '#1e293b',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: isActive ? 700 : 600,
                    }}
                  >
                    {folder.name}
                    <span style={{ color: '#64748b', marginLeft: '6px', fontWeight: 700 }}>({folder.documents.length})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>
                {selectedFolder?.name || 'Folder'} Documents
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input ref={fileInputRef} type="file" accept={ACCEPTED_FILES} disabled={uploading || !capabilities.upload} />
                <button
                  type="button"
                  onClick={uploadToCurrentFolder}
                  disabled={uploading || !selectedFolderId || !capabilities.upload}
                  style={{
                    border: 'none',
                    borderRadius: '8px',
                    background: uploading ? '#94a3b8' : '#0ea5e9',
                    color: 'white',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: uploading || !selectedFolderId || !capabilities.upload ? 'not-allowed' : 'pointer',
                    opacity: capabilities.upload ? 1 : 0.5,
                  }}
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
                <button
                  type="button"
                  onClick={loadOverview}
                  disabled={loading || uploading}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    background: 'white',
                    color: '#1e293b',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: loading || uploading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Refresh
                </button>
                {pendingDocCount > 0 && capabilities.manage && (
                  <button
                    type="button"
                    onClick={scanPending}
                    disabled={loading || uploading || scanning}
                    style={{
                      border: 'none',
                      borderRadius: '8px',
                      background: scanning ? '#94a3b8' : '#0f766e',
                      color: 'white',
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: loading || uploading || scanning ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {scanning ? 'Scanning...' : 'Scan Pending'}
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div style={{ margin: '12px', padding: '10px 12px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '12px' }}>
                {error}
              </div>
            )}

            <div style={{ padding: '12px' }}>
              {loading ? (
                <div style={{ color: '#64748b', fontSize: '13px' }}>Loading...</div>
              ) : !selectedFolder ? (
                <div style={{ color: '#64748b', fontSize: '13px' }}>Select a folder.</div>
              ) : selectedFolder.documents.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '13px' }}>No documents in this folder yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {selectedFolder.documents.map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '10px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '10px 12px',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        {(() => {
                          const historyFromApi = Array.isArray(doc.downloadHistory)
                            ? doc.downloadHistory
                                .map((h) => ({
                                  downloadedByName: h?.downloadedByName || null,
                                  downloadedAt: h?.downloadedAt || null,
                                }))
                                .filter((h) => h.downloadedByName || h.downloadedAt)
                            : [];
                          const fallbackHistory =
                            doc.lastDownloadedByName || doc.lastDownloadedAt
                              ? [
                                  {
                                    downloadedByName: doc.lastDownloadedByName || null,
                                    downloadedAt: doc.lastDownloadedAt || null,
                                  },
                                ]
                              : [];
                          const downloadLines = (historyFromApi.length > 0 ? historyFromApi : fallbackHistory).slice(0, 2);
                          return (
                            <>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.originalFileName}
                        </div>
                        <div style={{ marginTop: '3px', fontSize: '11px', color: '#64748b', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <span>Uploaded by: {doc.uploadedByName || 'Unknown'}</span>
                          <span>Uploaded: {formatDateTime(doc.createdAt) || '—'}</span>
                          {doc.sizeBytes ? <span>{formatBytes(doc.sizeBytes)}</span> : null}
                        </div>
                        {downloadLines.length > 0 ? (
                          downloadLines.map((entry, idx) => (
                            <div
                              key={`${doc.id}-download-${idx}`}
                              style={{ marginTop: '2px', fontSize: '11px', color: '#64748b', display: 'flex', gap: '10px', flexWrap: 'wrap' }}
                            >
                              <span>Downloaded by: {entry.downloadedByName || '—'}</span>
                              <span>Downloaded: {formatDateTime(entry.downloadedAt) || '—'}</span>
                            </div>
                          ))
                        ) : (
                          <div style={{ marginTop: '2px', fontSize: '11px', color: '#64748b', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <span>Downloaded by: —</span>
                            <span>Downloaded: —</span>
                          </div>
                        )}
                            </>
                          );
                        })()}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                        {(() => {
                          const pill = scanStatusPill(doc.scanStatus);
                          return (
                            <span
                              style={{
                                background: pill.bg,
                                color: pill.fg,
                                borderRadius: '999px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 800,
                              }}
                            >
                              Scan: {pill.label}
                            </span>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() => openDocument(doc)}
                          style={{
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            background: 'white',
                            color: '#1e293b',
                            padding: '8px 10px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            opacity: 1,
                          }}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromDataRoom(doc.id)}
                          disabled={workingDocId === doc.id || doc.canManage === false}
                          style={{
                            border: '1px solid #fecaca',
                            borderRadius: '8px',
                            background: 'white',
                            color: '#991b1b',
                            padding: '8px 10px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: workingDocId === doc.id || doc.canManage === false ? 'not-allowed' : 'pointer',
                            opacity: doc.canManage === false ? 0.5 : 1,
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', background: '#fafafa', padding: '10px 12px', fontSize: '11px', color: '#64748b' }}>
              Allowed types: PDF, Office docs, CSV, TXT. Max file size: 100 MB.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

