import { NextResponse } from 'next/server';
import { handleDataRoomUpload } from '@/lib/dataroom/upload-handler';
import { isPrivateBlobStorageConfigured } from '@/lib/dataroom/blob-storage';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (isPrivateBlobStorageConfigured()) {
    return NextResponse.json({ error: 'Data Room files must be uploaded to private storage.' }, { status: 400 });
  }
  return handleDataRoomUpload(request, String(process.env.BLOB_READ_WRITE_TOKEN || '').trim() || null, 'BLOB_READ_WRITE_TOKEN');
}
