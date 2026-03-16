import { scanDataRoomDocument, type DataRoomScanResult } from '@/lib/dataroom/malware-scan';

type ScanProviderInput = {
  fileUrl: string | null;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
};

type ClamHttpResponse = {
  status?: string;
  reason?: string | null;
};

function normalizeResult(input: ClamHttpResponse): DataRoomScanResult {
  const status = String(input?.status || '').toLowerCase();
  if (status === 'clean') return { status: 'clean', reason: input?.reason || null, provider: 'clamav_http' };
  if (status === 'blocked') return { status: 'blocked', reason: input?.reason || 'Blocked by scanner policy.', provider: 'clamav_http' };
  throw new Error(`Invalid scan provider response status: ${status || 'empty'}`);
}

async function scanUsingClamHttp(input: ScanProviderInput): Promise<DataRoomScanResult> {
  const serviceUrl = String(process.env.DATAROOM_SCAN_SERVICE_URL || '').trim();
  if (!serviceUrl) {
    throw new Error('DATAROOM_SCAN_SERVICE_URL is not configured for clamav_http provider');
  }
  if (!input.fileUrl) {
    throw new Error('Missing file URL for scanner provider');
  }

  const response = await fetch(serviceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Scan provider request failed (${response.status})`);
  }

  const payload = (await response.json()) as ClamHttpResponse;
  return normalizeResult(payload);
}

export async function scanDataRoomDocumentWithProvider(
  input: ScanProviderInput,
): Promise<DataRoomScanResult> {
  const provider = String(process.env.DATAROOM_SCAN_PROVIDER || 'policy').trim().toLowerCase();

  if (provider === 'clamav_http') {
    return scanUsingClamHttp(input);
  }

  // Fallback policy scanner for local/dev or when provider is not configured.
  const fallback = scanDataRoomDocument({
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  });
  return { ...fallback, provider: 'policy' };
}

