/**
 * Moves Data Room files still in the public Blob store into the private Blob
 * store, then deletes the public copy. Bank Statements only by default; pass
 * --all to move every Data Room file.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-bank-statements-to-private-blob.ts                 (dry run)
 *   npx tsx --env-file=.env.local scripts/migrate-bank-statements-to-private-blob.ts --all           (dry run, all folders)
 *   npx tsx --env-file=.env.local scripts/migrate-bank-statements-to-private-blob.ts --all --apply
 *
 * Needs BLOB_READ_WRITE_TOKEN (public store), PRIVATE_BLOB_READ_WRITE_TOKEN (private store), and DATABASE_URL.
 */
import { del, put } from '@vercel/blob';
import prisma from '../lib/prisma';
import { DATAROOM_BANK_STATEMENTS_FOLDER_ID } from '../lib/dataroom/constants';
import { getDataRoomState } from '../lib/dataroom/state';
import { isPrivateBlob, privateBlobToken } from '../lib/dataroom/blob-storage';

const apply = process.argv.includes('--apply');
const allFolders = process.argv.includes('--all');

async function main() {
  const privateToken = privateBlobToken();
  const publicToken = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  if (!privateToken) throw new Error('PRIVATE_BLOB_READ_WRITE_TOKEN is not set');
  if (!publicToken) throw new Error('BLOB_READ_WRITE_TOKEN is not set');

  const companies = await prisma.company.findMany({ select: { id: true, name: true, userDefinedAllocations: true } });
  let moved = 0;
  let failed = 0;

  for (const company of companies) {
    const statementIds = new Set(
      (getDataRoomState(company.userDefinedAllocations).documentIndex as Array<Record<string, unknown>>)
        .filter((e) => String(e?.folderId || '') === DATAROOM_BANK_STATEMENTS_FOLDER_ID)
        .map((e) => String(e?.documentId || ''))
        .filter(Boolean),
    );
    if (!allFolders && statementIds.size === 0) continue;

    const docs = (
      await prisma.dataRoomDocument.findMany({
        where: allFolders ? { companyId: company.id } : { companyId: company.id, id: { in: Array.from(statementIds) } },
        select: { id: true, originalFileName: true, blobUrl: true, blobPathname: true, storageAccess: true, contentType: true },
      })
    ).filter((d) => !isPrivateBlob(d));
    if (docs.length === 0) continue;

    console.log(`${company.name}: ${docs.length} public file${docs.length === 1 ? '' : 's'}`);
    for (const doc of docs) {
      if (!apply) {
        console.log(`  would move ${doc.originalFileName}`);
        continue;
      }
      try {
        const res = await fetch(doc.blobUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`download failed (${res.status})`);
        const body = Buffer.from(await res.arrayBuffer());
        const baseName = (doc.blobPathname || doc.originalFileName).split('/').pop() || doc.id;
        const prefix = statementIds.has(doc.id) ? 'bank-statements' : 'dataroom';
        const blob = await put(`${prefix}/${company.id}/${baseName}`, body, {
          access: 'private',
          token: privateToken,
          contentType: doc.contentType || 'application/octet-stream',
          addRandomSuffix: true,
        });
        await prisma.dataRoomDocument.update({
          where: { id: doc.id },
          data: { blobUrl: blob.url, blobPathname: blob.pathname, storageAccess: 'private' },
        });
        await del(doc.blobUrl, { token: publicToken }).catch((e) => console.warn(`  public copy not deleted: ${e}`));
        moved += 1;
        console.log(`  moved ${doc.originalFileName}`);
      } catch (e) {
        failed += 1;
        console.error(`  FAILED ${doc.originalFileName}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  console.log(apply ? `Done. Moved ${moved}, failed ${failed}.` : 'Dry run only. Re-run with --apply to move the files.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
