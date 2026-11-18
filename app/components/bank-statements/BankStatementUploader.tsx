'use client';

import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import {
  DATAROOM_BANK_STATEMENTS_FOLDER_ID,
  DATAROOM_MAX_FILE_SIZE_BYTES,
  DATAROOM_MAX_SPREADSHEET_FILE_SIZE_BYTES,
} from '@/lib/dataroom/constants';
import { isTransactionFileName } from '@/lib/bank-statements/providers';

type FileProgress = { key: string; name: string; status: 'uploading' | 'done' | 'failed'; message?: string };

async function uploadStatement(companyId: string, file: File, privateStorage: boolean) {
  const blob = await upload(file.name, file, {
    access: privateStorage ? 'private' : 'public',
    handleUploadUrl: privateStorage ? '/api/dataroom/upload-private' : '/api/dataroom/upload',
    clientPayload: JSON.stringify({ companyId, category: 'OTHER', originalFileName: file.name, sizeBytes: file.size }),
  });
  const res = await fetch('/api/dataroom/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId,
      category: 'OTHER',
      originalFileName: file.name,
      blob,
      folderId: DATAROOM_BANK_STATEMENTS_FOLDER_ID,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Failed to add the statement to the Data Room');
  const documentId = String(json?.documentId || '');
  try {
    await fetch('/api/dataroom/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, documentId }),
    });
  } catch {
    // The Data Room "Scan Pending" action picks up anything this misses.
  }
}

/** Drag-and-drop statement uploader; files land in the Data Room Bank Statements folder. */
export default function BankStatementUploader({
  companyId,
  privateStorage,
  onUploaded,
}: {
  companyId: string;
  privateStorage: boolean;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<FileProgress[]>([]);
  const busy = progress.some((p) => p.status === 'uploading');

  const setStatus = (key: string, patch: Partial<FileProgress>) =>
    setProgress((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const handleFiles = async (list: FileList | null) => {
    const files = Array.from(list || []);
    if (files.length === 0 || busy) return;
    const items = files.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, status: 'uploading' as const }));
    setProgress(items);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const key = items[i].key;
      const isExport = isTransactionFileName(file.name);
      if (!isExport && !file.name.toLowerCase().endsWith('.pdf')) {
        setStatus(key, { status: 'failed', message: 'Upload statement PDFs or transaction files (CSV, XLSX, XLS).' });
        continue;
      }
      if (file.size > (isExport ? DATAROOM_MAX_SPREADSHEET_FILE_SIZE_BYTES : DATAROOM_MAX_FILE_SIZE_BYTES)) {
        setStatus(key, { status: 'failed', message: `File is larger than ${isExport ? '25' : '100'} MB.` });
        continue;
      }
      try {
        await uploadStatement(companyId, file, privateStorage);
        setStatus(key, { status: 'done', message: isExport ? 'Awaiting review by the Corelytics team.' : undefined });
      } catch (e) {
        setStatus(key, { status: 'failed', message: e instanceof Error ? e.message : String(e) });
      }
    }
    if (inputRef.current) inputRef.current.value = '';
    onUploaded();
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        style={{
          border: `2px dashed ${dragging ? '#2751d0' : '#cbd5e1'}`,
          background: dragging ? '#eff6ff' : '#f8fafc',
          borderRadius: '8px',
          padding: '18px',
          textAlign: 'center',
          fontSize: '12px',
          color: '#475569',
        }}
      >
        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
          {busy ? 'Uploading…' : 'Drag statement PDFs or transaction files here'}
        </div>
        <div style={{ marginBottom: '10px' }}>
          One PDF per account per month, or a CSV / Excel transaction export with date, description, and amount columns. Files go to the
          Data Room Bank Statements folder.
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          style={{
            padding: '7px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.55 : 1,
            border: '1px solid #2751d0',
            background: '#2751d0',
            color: 'white',
          }}
        >
          Choose Files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf,.csv,.xlsx,.xls"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>
      {progress.length > 0 && (
        <div style={{ marginTop: '8px', display: 'grid', gap: '2px' }}>
          {progress.map((p) => (
            <div key={p.key} style={{ fontSize: '11px', color: p.status === 'failed' ? '#b91c1c' : p.status === 'done' ? '#047857' : '#475569' }}>
              {p.name}:{' '}
              {p.status === 'uploading' ? 'Uploading…' : p.status === 'done' ? `Uploaded${p.message ? `. ${p.message}` : ''}` : `Failed. ${p.message || ''}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
