import { handleDataRoomUpload } from '@/lib/dataroom/upload-handler';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handleDataRoomUpload(request, String(process.env.BLOB_READ_WRITE_TOKEN || '').trim() || null, 'BLOB_READ_WRITE_TOKEN');
}
