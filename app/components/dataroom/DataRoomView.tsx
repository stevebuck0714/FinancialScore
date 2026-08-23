'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { formatEstDateTime } from '@/lib/time/eastern';

interface DataRoomViewProps {
  selectedCompanyId: string;
  companyName: string;
}

type AskResponse = {
  shortAnswer: string;
  longAnswer: string;
  citedBullets: Array<{
    text: string;
    citations: Array<{
      url: string;
      title?: string;
      publishedDate?: string | null;
    }>;
  }>;
  howThisImpactsUs: string;
  sources: Array<{
    url: string;
    title?: string;
    publishedDate?: string | null;
    snippet?: string;
  }>;
};

type FolderDoc = {
  id: string;
  folderId: string;
  category?: string | null;
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
  lastViewedByName?: string | null;
  lastViewedAt?: string | null;
  viewHistory?: Array<{
    viewedByName: string | null;
    viewedAt: string | null;
  }>;
};

type DataRoomFolder = {
  id: string;
  key: string;
  name: string;
  order: number;
  documents: FolderDoc[];
};

type StorageSummary = {
  usedBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  usagePct: number;
  level: 'ok' | 'warning' | 'critical';
};

type AuditEvent = {
  id: string;
  at: string;
  action: string;
  userEmail: string;
  documentId: string | null;
  folderId: string | null;
  folderName?: string | null;
  ipAddress: string;
};

const ACCEPTED_FILES = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt';
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_SPREADSHEET_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const DOC_CATEGORY_ORDER = [
  'LOAN_DOCUMENTS',
  'FINANCING_DOCUMENTS',
  'LEGAL_AND_REGULATORY',
  'TAX_DOCUMENTS',
  'OTHER',
] as const;

function categoryLabel(value: string | null | undefined) {
  const key = String(value || 'OTHER').toUpperCase();
  if (key === 'LOAN_DOCUMENTS') return 'Loan Documents';
  if (key === 'FINANCING_DOCUMENTS') return 'Financing Documents';
  if (key === 'LEGAL_AND_REGULATORY') return 'Legal and Regulatory';
  if (key === 'TAX_DOCUMENTS') return 'Tax Documents';
  return 'Other';
}

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
  return formatEstDateTime(value, { second: '2-digit' }) || null;
}

function isSpreadsheetFileName(fileName: string): boolean {
  const lower = String(fileName || '').toLowerCase();
  return lower.endsWith('.xls') || lower.endsWith('.xlsx') || lower.endsWith('.csv');
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
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditUserFilter, setAuditUserFilter] = useState('');
  const [auditFolderFilter, setAuditFolderFilter] = useState('');
  const [auditFromFilter, setAuditFromFilter] = useState('');
  const [auditToFilter, setAuditToFilter] = useState('');
  const [auditOffset, setAuditOffset] = useState(0);
  const [docSearchDocumentId, setDocSearchDocumentId] = useState('');
  const [docSearchQuestion, setDocSearchQuestion] = useState('');
  const [docSearchLoading, setDocSearchLoading] = useState(false);
  const [docSearchError, setDocSearchError] = useState<string | null>(null);
  const [docSearchResponse, setDocSearchResponse] = useState<AskResponse | null>(null);
  const [collapsedCategoryKeys, setCollapsedCategoryKeys] = useState<Record<string, boolean>>({});
  const [collapsedAuditFolderKeys, setCollapsedAuditFolderKeys] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) || null,
    [folders, selectedFolderId],
  );
  const selectedFolderDocumentsByCategory = useMemo(() => {
    const docs = selectedFolder?.documents || [];
    const grouped: Record<string, FolderDoc[]> = {};
    for (const doc of docs) {
      const key = String(doc.category || 'OTHER').toUpperCase();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(doc);
    }
    const orderedKeys = [
      ...DOC_CATEGORY_ORDER.filter((key) => (grouped[key] || []).length > 0),
      ...Object.keys(grouped).filter((key) => !DOC_CATEGORY_ORDER.includes(key as any)),
    ];
    return orderedKeys.map((key) => ({
      key,
      label: categoryLabel(key),
      documents: grouped[key] || [],
    }));
  }, [selectedFolder]);
  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const folder of folders) {
      map.set(String(folder.id), String(folder.name || folder.id));
    }
    return map;
  }, [folders]);
  const auditEventsByFolder = useMemo(() => {
    const grouped = new Map<string, { folderName: string; events: AuditEvent[] }>();
    for (const evt of auditEvents) {
      const folderName = String(evt.folderName || (evt.folderId ? folderNameById.get(String(evt.folderId)) : '') || 'General');
      if (!grouped.has(folderName)) {
        grouped.set(folderName, { folderName, events: [] });
      }
      grouped.get(folderName)!.events.push(evt);
    }
    return Array.from(grouped.values()).sort((a, b) => a.folderName.localeCompare(b.folderName));
  }, [auditEvents, folderNameById]);
  const toggleAuditFolderCollapsed = (folderName: string) => {
    setCollapsedAuditFolderKeys((prev) => ({
      ...prev,
      [folderName]: !Boolean(prev[folderName]),
    }));
  };
  const toggleCategoryCollapsed = (categoryKey: string) => {
    if (!selectedFolderId) return;
    const stateKey = `${selectedFolderId}:${categoryKey}`;
    setCollapsedCategoryKeys((prev) => ({
      ...prev,
      [stateKey]: !Boolean(prev[stateKey]),
    }));
  };
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
  const allDataRoomDocs = useMemo(
    () =>
      folders.flatMap((folder) =>
        (Array.isArray(folder.documents) ? folder.documents : []).map((doc) => ({
          ...doc,
          folderName: folder.name,
        })),
      ),
    [folders],
  );
  const selectedSearchDoc = useMemo(
    () => allDataRoomDocs.find((d) => d.id === docSearchDocumentId) || null,
    [allDataRoomDocs, docSearchDocumentId],
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
      const incomingStorage = data?.storage && typeof data.storage === 'object' ? (data.storage as StorageSummary) : null;
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
      if (incomingStorage) {
        setStorage({
          usedBytes: Number(incomingStorage.usedBytes || 0),
          quotaBytes: Number(incomingStorage.quotaBytes || 0),
          remainingBytes: Number(incomingStorage.remainingBytes || 0),
          usagePct: Number(incomingStorage.usagePct || 0),
          level: (incomingStorage.level as any) || 'ok',
        });
      } else {
        setStorage(null);
      }
      setFolders(incoming);
      if (!selectedFolderId && incoming.length > 0) {
        setSelectedFolderId(String(incoming[0].id));
      } else if (selectedFolderId && incoming.length > 0 && !incoming.some((f: any) => String(f.id) === selectedFolderId)) {
        setSelectedFolderId(String(incoming[0].id));
      }
      if (docSearchDocumentId && !incoming.some((f: any) => Array.isArray(f?.documents) && f.documents.some((d: any) => String(d?.id) === docSearchDocumentId))) {
        setDocSearchDocumentId('');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load DataRoom');
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async (overrideOffset?: number) => {
    if (!selectedCompanyId || !capabilities.manage) return;
    const nextOffset = typeof overrideOffset === 'number' ? overrideOffset : auditOffset;
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        limit: '25',
        offset: String(nextOffset),
      });
      if (auditActionFilter) params.set('action', auditActionFilter);
      if (auditUserFilter) params.set('userEmail', auditUserFilter);
      if (auditFolderFilter) params.set('folderId', auditFolderFilter);
      if (auditFromFilter) params.set('from', new Date(auditFromFilter).toISOString());
      if (auditToFilter) params.set('to', new Date(auditToFilter).toISOString());
      const res = await fetch(`/api/dataroom/audit?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load audit log');
      const incoming = Array.isArray(data?.events) ? data.events : [];
      const withFolderName = incoming.map((evt: any) => ({
        ...evt,
        folderName: evt?.folderId ? folderNameById.get(String(evt.folderId)) || String(evt.folderId) : null,
      }));
      setAuditEvents(withFolderName);
      setAuditTotal(Number(data?.total || 0));
      setAuditOffset(nextOffset);
    } catch (e: any) {
      setError(e?.message || 'Failed to load DataRoom audit log');
    } finally {
      setAuditLoading(false);
    }
  };

  const exportAuditCsv = async () => {
    const params = new URLSearchParams({
      companyId: selectedCompanyId,
      format: 'csv',
      limit: '1000',
      offset: '0',
    });
    if (auditActionFilter) params.set('action', auditActionFilter);
    if (auditUserFilter) params.set('userEmail', auditUserFilter);
    if (auditFolderFilter) params.set('folderId', auditFolderFilter);
    if (auditFromFilter) params.set('from', new Date(auditFromFilter).toISOString());
    if (auditToFilter) params.set('to', new Date(auditToFilter).toISOString());
    window.open(`/api/dataroom/audit?${params.toString()}`, '_blank', 'noreferrer');
  };

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  useEffect(() => {
    if (capabilities.manage && selectedCompanyId) {
      loadAudit(0);
    } else {
      setAuditEvents([]);
      setAuditTotal(0);
      setAuditOffset(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilities.manage, selectedCompanyId, folderNameById]);

  const uploadToCurrentFolder = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !selectedFolderId) return;

    if (isSpreadsheetFileName(file.name) && file.size > MAX_SPREADSHEET_FILE_SIZE_BYTES) {
      alert('Spreadsheet file too large. Maximum spreadsheet file size is 25 MB.');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      alert('File too large. Maximum file size is 100 MB.');
      return;
    }
    if (storage && Number.isFinite(storage.quotaBytes) && storage.quotaBytes > 0) {
      const projected = Number(storage.usedBytes || 0) + Number(file.size || 0);
      if (projected > storage.quotaBytes) {
        alert(
          `Storage quota exceeded. Used ${formatBytes(storage.usedBytes)} of ${formatBytes(storage.quotaBytes)}. Upload would exceed the company limit.`,
        );
        return;
      }
    }

    setUploading(true);
    setError(null);
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/dataroom/upload',
        clientPayload: JSON.stringify({
          companyId: selectedCompanyId,
          category: 'OTHER',
          originalFileName: file.name,
          sizeBytes: file.size,
        }),
      });

      const registerRes = await fetch('/api/dataroom/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          category: 'OTHER',
          originalFileName: file.name,
          blob,
          folderId: selectedFolderId,
        }),
      });
      const registerData = await registerRes.json();
      if (!registerRes.ok) {
        throw new Error(registerData?.error || 'Failed to register Data Room document');
      }

      const docId = String(registerData?.documentId || '');
      if (!docId) throw new Error('Missing document ID after upload');

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
    if (!confirm('Delete this document from the Data Room repository? This does not affect internal company Documents.')) {
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
      if (!res.ok) throw new Error(data?.error || 'Failed to delete Data Room document');
      await loadOverview();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete Data Room document');
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
        alert('This document is quarantined and cannot be downloaded until scan status is clean.');
      }
      return;
    }
    window.open(`/api/dataroom/documents/${doc.id}/open`, '_blank', 'noreferrer');
    // Refresh shortly after open so repeated downloads show up in history.
    window.setTimeout(() => {
      loadOverview();
    }, 900);
  };

  const viewDocument = async (doc: FolderDoc) => {
    const scanStatus = String(doc.scanStatus || '').toLowerCase();
    if (scanStatus !== 'clean') {
      if (scanStatus === 'pending_scan') {
        alert('This document is pending malware scan. Click "Scan Pending" and try again.');
      } else if (scanStatus === 'scan_failed') {
        alert('This document scan failed. Click "Scan Pending" to retry scanning.');
      } else {
        alert('This document is quarantined and cannot be viewed until scan status is clean.');
      }
      return;
    }
    window.open(`/api/dataroom/documents/${doc.id}/view`, '_blank', 'noreferrer');
  };

  const runDocumentSearch = async () => {
    setDocSearchError('Data Room document search needs a dedicated Data Room index and is temporarily unavailable.');
    setDocSearchResponse(null);
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 32px 48px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '18px', fontWeight: 800, color: '#1F70C1', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
          Corelytics Data Room
        </div>
      </div>

      <div
        style={{
          background: 'white',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '16px' }}>
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
            {storage && storage.level !== 'ok' && (
              <div
                style={{
                  margin: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: storage.level === 'critical' ? '1px solid #fecaca' : '1px solid #fed7aa',
                  background: storage.level === 'critical' ? '#fef2f2' : '#fff7ed',
                  color: storage.level === 'critical' ? '#991b1b' : '#9a3412',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                {storage.level === 'critical'
                  ? `Storage is near or over limit (${storage.usagePct.toFixed(1)}% used). Remove files or increase quota before uploading more.`
                  : `Storage is above 80% (${storage.usagePct.toFixed(1)}% used). Consider cleanup soon to avoid upload blocks.`}
              </div>
            )}

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
                  {selectedFolderDocumentsByCategory.map((section) => (
                    <div key={section.key} style={{ display: 'grid', gap: '8px' }}>
                      {(() => {
                        const stateKey = `${selectedFolderId}:${section.key}`;
                        const isCollapsed = Boolean(collapsedCategoryKeys[stateKey]);
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleCategoryCollapsed(section.key)}
                              style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                background: '#f8fafc',
                                color: '#334155',
                                padding: '8px 10px',
                                fontSize: '12px',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <span>{section.label} ({section.documents.length})</span>
                              <span>{isCollapsed ? 'Expand' : 'Collapse'}</span>
                            </button>
                            {!isCollapsed && section.documents.map((doc) => (
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
                              onClick={() => viewDocument(doc)}
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
                              View
                            </button>
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
                              Download
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
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', background: '#fafafa', padding: '10px 12px', fontSize: '11px', color: '#64748b' }}>
              Allowed types: PDF, Office docs, CSV, TXT. Max file size: 100 MB (spreadsheets: 25 MB).
            </div>
          </div>
        </div>
        <div style={{ marginTop: '16px', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '10px 12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>Search Documents</div>
            <div style={{ marginTop: '2px', fontSize: '12px', color: '#64748b' }}>
              Data Room document search will use its own dedicated index and is temporarily unavailable.
            </div>
          </div>
          <div style={{ padding: '12px', display: 'grid', gap: '10px' }}>
            <select
              value={docSearchDocumentId}
              onChange={(e) => setDocSearchDocumentId(e.target.value)}
              disabled
              style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            >
              <option value="">Select document</option>
              {allDataRoomDocs.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.originalFileName} ({doc.folderName})
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={docSearchQuestion}
                onChange={(e) => setDocSearchQuestion(e.target.value)}
                placeholder={docSearchDocumentId ? 'Ask about this document...' : 'Select a document first...'}
                disabled
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    runDocumentSearch();
                  }
                }}
              />
              <button
                type="button"
                onClick={runDocumentSearch}
                disabled={
                  true
                }
                style={{
                  border: 'none',
                  borderRadius: '8px',
                  background: docSearchLoading ? '#94a3b8' : '#0ea5e9',
                  color: 'white',
                  padding: '10px 12px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'not-allowed',
                }}
              >
                {docSearchLoading ? 'Searching...' : 'Search Document'}
              </button>
            </div>
            {selectedSearchDoc && String(selectedSearchDoc.extractionStatus || '').toUpperCase() !== 'DONE' && (
              <div style={{ padding: '10px 12px', background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: '8px', fontSize: '12px' }}>
                Document text extraction is {String(selectedSearchDoc.extractionStatus)}. Search works after extraction is DONE.
              </div>
            )}
            {docSearchError && (
              <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', fontSize: '12px' }}>
                {docSearchError}
              </div>
            )}
            {docSearchResponse && (
              <div style={{ display: 'grid', gap: '8px', marginTop: '4px' }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Short answer</div>
                  <div style={{ marginTop: '4px', color: '#0f172a', fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{docSearchResponse.shortAnswer}</div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Cited bullets</div>
                  <div style={{ marginTop: '6px', display: 'grid', gap: '6px' }}>
                    {docSearchResponse.citedBullets.map((item, idx) => (
                      <div key={`${idx}-${item.text.slice(0, 24)}`} style={{ fontSize: '13px', color: '#0f172a', lineHeight: '1.45' }}>
                        • {item.text}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        {capabilities.manage && (
          <div style={{ marginTop: '16px', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>
                DataRoom Audit Trail ({auditTotal})
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  style={{ padding: '7px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                >
                  <option value="">All actions</option>
                  <option value="document_assigned">document_assigned</option>
                  <option value="document_moved">document_moved</option>
                  <option value="document_removed">document_removed</option>
                  <option value="document_viewed">document_viewed</option>
                  <option value="document_view_blocked">document_view_blocked</option>
                  <option value="document_opened">document_opened</option>
                  <option value="document_open_blocked">document_open_blocked</option>
                  <option value="scan_completed">scan_completed</option>
                  <option value="overview_viewed">overview_viewed</option>
                  <option value="permissions_updated">permissions_updated</option>
                </select>
                <input
                  type="text"
                  value={auditUserFilter}
                  onChange={(e) => setAuditUserFilter(e.target.value)}
                  placeholder="Filter by user email"
                  style={{ padding: '7px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                />
                <select
                  value={auditFolderFilter}
                  onChange={(e) => setAuditFolderFilter(e.target.value)}
                  style={{ padding: '7px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                >
                  <option value="">All folders</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <input
                  type="datetime-local"
                  value={auditFromFilter}
                  onChange={(e) => setAuditFromFilter(e.target.value)}
                  style={{ padding: '7px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                />
                <input
                  type="datetime-local"
                  value={auditToFilter}
                  onChange={(e) => setAuditToFilter(e.target.value)}
                  style={{ padding: '7px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                />
                <button
                  type="button"
                  onClick={() => loadAudit(0)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: '8px', background: 'white', color: '#1e293b', padding: '8px 12px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={exportAuditCsv}
                  style={{ border: 'none', borderRadius: '8px', background: '#0f766e', color: 'white', padding: '8px 12px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                >
                  Export CSV
                </button>
              </div>
            </div>
            <div style={{ padding: '12px' }}>
              {auditLoading ? (
                <div style={{ color: '#64748b', fontSize: '13px' }}>Loading audit log...</div>
              ) : auditEvents.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '13px' }}>No audit events found for current filters.</div>
              ) : (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {auditEventsByFolder.map((group) => (
                    <div key={group.folderName} style={{ display: 'grid', gap: '8px' }}>
                      {(() => {
                        const isCollapsed = Boolean(collapsedAuditFolderKeys[group.folderName]);
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleAuditFolderCollapsed(group.folderName)}
                              style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                background: '#f8fafc',
                                color: '#334155',
                                padding: '8px 10px',
                                fontSize: '12px',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <span>{group.folderName} ({group.events.length})</span>
                              <span>{isCollapsed ? 'Expand' : 'Collapse'}</span>
                            </button>
                            {!isCollapsed && group.events.map((evt) => (
                        <div
                          key={evt.id || `${evt.at}-${evt.action}-${evt.userEmail}`}
                          style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', display: 'grid', gap: '4px' }}
                        >
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>
                            {evt.action}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <span>{formatDateTime(evt.at) || evt.at}</span>
                            <span>User: {evt.userEmail || 'unknown'}</span>
                            {evt.documentId ? <span>Doc: {evt.documentId}</span> : null}
                            <span>IP: {evt.ipAddress || 'unknown'}</span>
                          </div>
                        </div>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
              {auditTotal > 25 && (
                <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => loadAudit(Math.max(0, auditOffset - 25))}
                    disabled={auditOffset <= 0 || auditLoading}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', background: 'white', color: '#1e293b', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: auditOffset <= 0 || auditLoading ? 'not-allowed' : 'pointer' }}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => loadAudit(auditOffset + 25)}
                    disabled={auditOffset + 25 >= auditTotal || auditLoading}
                    style={{ border: '1px solid #cbd5e1', borderRadius: '8px', background: 'white', color: '#1e293b', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: auditOffset + 25 >= auditTotal || auditLoading ? 'not-allowed' : 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

