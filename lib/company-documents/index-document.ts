import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { chunkDocumentText } from './chunk-text';
import { embedTexts } from './embeddings';

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function toVectorLiteral(vec: number[]): string {
  // pgvector literal format: '[1,2,3]'
  // Keep precision moderate to reduce SQL payload size.
  const body = vec.map((n) => Number(n).toFixed(6)).join(',');
  return `[${body}]`;
}

export async function indexCompanyDocument(params: {
  documentId: string;
  // If true, re-index even if status is DONE.
  force?: boolean;
}): Promise<{ ok: boolean; indexedChunks: number; embeddingModel?: string; embeddingDim?: number; error?: string }> {
  const { documentId, force } = params;

  const doc = await prisma.companyDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      companyId: true,
      extractionStatus: true,
      extractedText: true,
      indexStatus: true,
    },
  });

  if (!doc) return { ok: false, indexedChunks: 0, error: 'Document not found' };

  const extractionStatus = String(doc.extractionStatus || '').toUpperCase();
  if (extractionStatus !== 'DONE') {
    return { ok: false, indexedChunks: 0, error: `Extraction not ready (${extractionStatus})` };
  }

  if (!force && String(doc.indexStatus || '').toUpperCase() === 'DONE') {
    const count = await prisma.companyDocumentChunk.count({ where: { documentId: doc.id } });
    return { ok: true, indexedChunks: count };
  }

  const fullText = String(doc.extractedText || '').trim();
  if (!fullText) {
    await prisma.companyDocument.update({
      where: { id: doc.id },
      data: {
        indexStatus: 'FAILED',
        indexedAt: null,
        indexError: 'No extracted text to index',
      },
    });
    return { ok: false, indexedChunks: 0, error: 'No extracted text to index' };
  }

  await prisma.companyDocument.update({
    where: { id: doc.id },
    data: { indexStatus: 'PENDING', indexedAt: null, indexError: null },
  });

  try {
    const chunks = chunkDocumentText({ text: fullText });
    if (chunks.length === 0) {
      throw new Error('Chunking produced 0 chunks');
    }

    const { model, vectors } = await embedTexts(chunks.map((c) => c.text));
    if (vectors.length !== chunks.length) {
      throw new Error(`Embedding mismatch: chunks=${chunks.length} vectors=${vectors.length}`);
    }

    const embeddingDim = vectors[0]?.length || 0;
    if (!embeddingDim) throw new Error('Embedding dim is 0');

    // Replace the existing index atomically-ish:
    // - delete prior chunks
    // - insert new chunks
    // (wrapped in a transaction)
    await prisma.$transaction(async (tx) => {
      await tx.companyDocumentChunk.deleteMany({ where: { documentId: doc.id } });

      // Insert in small batches to avoid giant SQL payloads.
      const BATCH = 50;
      for (let i = 0; i < chunks.length; i += BATCH) {
        const slice = chunks.slice(i, i + BATCH);

        // Use $executeRawUnsafe because we need to CAST a dynamic vector literal.
        // Values are still parameterized except the vector cast, which is built from numeric arrays.
        const valuesSql: string[] = [];
        const params: any[] = [];
        let p = 1;

        for (let j = 0; j < slice.length; j += 1) {
          const c = slice[j];
          const v = vectors[i + j];
          const id = crypto.randomUUID();
          const text = c.text;
          const textHash = sha256Hex(text);
          const vecLit = toVectorLiteral(v);

          valuesSql.push(
            `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}::vector)`,
          );
          params.push(
            id,
            doc.id,
            doc.companyId,
            c.chunkIndex,
            c.startOffset,
            c.endOffset,
            text,
            textHash,
            vecLit,
          );
        }

        const sql = `
          INSERT INTO "CompanyDocumentChunk"
            ("id","documentId","companyId","chunkIndex","startOffset","endOffset","text","textHash","embedding")
          VALUES
            ${valuesSql.join(',')}
        `;

        await tx.$executeRawUnsafe(sql, ...params);
      }

      await tx.companyDocument.update({
        where: { id: doc.id },
        data: {
          indexStatus: 'DONE',
          indexedAt: new Date(),
          indexError: null,
          embeddingModel: model,
          embeddingDim,
        },
      });
    });

    return { ok: true, indexedChunks: chunks.length, embeddingModel: model, embeddingDim };
  } catch (e: any) {
    const message = e?.message || 'Indexing failed';
    await prisma.companyDocument.update({
      where: { id: doc.id },
      data: { indexStatus: 'FAILED', indexedAt: null, indexError: message },
    });
    return { ok: false, indexedChunks: 0, error: message };
  }
}

