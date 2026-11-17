import { del, get } from '@vercel/blob';

export type DataRoomStorageAccess = 'public' | 'private';

type StoredBlob = { blobUrl: string; storageAccess?: string | null };

/**
 * Private files live in a separate private Blob store connected to the project
 * with the PRIVATE_BLOB environment-variable prefix. The default store stays public.
 */
export function privateBlobToken(): string | null {
  return String(process.env.PRIVATE_BLOB_READ_WRITE_TOKEN || '').trim() || null;
}

export function isPrivateBlobStorageConfigured(): boolean {
  return privateBlobToken() !== null;
}

export function storageAccessForUrl(blobUrl: string): DataRoomStorageAccess {
  try {
    return new URL(blobUrl).hostname.endsWith('.private.blob.vercel-storage.com') ? 'private' : 'public';
  } catch {
    return 'public';
  }
}

export function isPrivateBlob(doc: StoredBlob): boolean {
  return doc.storageAccess === 'private' || storageAccessForUrl(doc.blobUrl) === 'private';
}

export async function readDataRoomBlobStream(
  doc: StoredBlob,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string | null; size: number | null }> {
  if (isPrivateBlob(doc)) {
    const token = privateBlobToken();
    if (!token) throw new Error('Private Blob storage is not configured (PRIVATE_BLOB_READ_WRITE_TOKEN).');
    const result = await get(doc.blobUrl, { access: 'private', token, useCache: false });
    if (!result || result.statusCode !== 200) throw new Error('Stored file not found.');
    return { stream: result.stream, contentType: result.blob.contentType, size: result.blob.size };
  }
  const res = await fetch(doc.blobUrl, { cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const size = Number(res.headers.get('content-length'));
  return { stream: res.body, contentType: res.headers.get('content-type'), size: Number.isFinite(size) ? size : null };
}

export async function readDataRoomBlob(doc: StoredBlob): Promise<ArrayBuffer> {
  const { stream } = await readDataRoomBlobStream(doc);
  return new Response(stream).arrayBuffer();
}

export async function deleteDataRoomBlob(doc: StoredBlob): Promise<void> {
  if (isPrivateBlob(doc)) {
    const token = privateBlobToken();
    if (!token) throw new Error('Private Blob storage is not configured (PRIVATE_BLOB_READ_WRITE_TOKEN).');
    await del(doc.blobUrl, { token });
    return;
  }
  await del(doc.blobUrl);
}
