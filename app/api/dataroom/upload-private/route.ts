import { handleDataRoomUpload } from '@/lib/dataroom/upload-handler';
import { privateBlobToken } from '@/lib/dataroom/blob-storage';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handleDataRoomUpload(request, privateBlobToken(), 'PRIVATE_BLOB_READ_WRITE_TOKEN');
}
