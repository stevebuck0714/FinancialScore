import prisma from '@/lib/prisma';
import { embedTexts } from './embeddings';

export type RetrievedChunk = {
  id: string;
  chunkIndex: number;
  startOffset: number | null;
  endOffset: number | null;
  text: string;
  score: number;
  keywordRank: number | null;
  vectorDistance: number | null;
};

function toVectorLiteral(vec: number[]): string {
  const body = vec.map((n) => Number(n).toFixed(6)).join(',');
  return `[${body}]`;
}

export async function retrieveDocumentChunks(params: {
  documentId: string;
  question: string;
  keywordLimit?: number;
  vectorLimit?: number;
  finalLimit?: number;
}): Promise<{ chunks: RetrievedChunk[]; debug: { keyword: number; vector: number } }> {
  const { documentId, question } = params;
  const keywordLimit = Math.max(0, Math.min(50, params.keywordLimit ?? 20));
  const vectorLimit = Math.max(0, Math.min(50, params.vectorLimit ?? 20));
  const finalLimit = Math.max(1, Math.min(25, params.finalLimit ?? 12));

  const q = String(question || '').trim();
  if (!q) return { chunks: [], debug: { keyword: 0, vector: 0 } };

  // Heuristic: "anchor phrases" improve recall for unstructured doc questions.
  // Many docs have consistent headers/phrases that are better search keys than the user's question.
  const qLower = q.toLowerCase();
  const anchorTerms: string[] = [];
  if (/\b(covenant|covenants)\b/.test(qLower)) anchorTerms.push('covenants', 'financial covenants');
  if (/\b(default|events? of default)\b/.test(qLower)) anchorTerms.push('events of default');
  if (/\b(defined term|definitions?)\b/.test(qLower)) anchorTerms.push('definitions');
  if (/\b(termination|renewal)\b/.test(qLower)) anchorTerms.push('term', 'termination');
  if (/\b(confidential|confidentiality)\b/.test(qLower)) anchorTerms.push('confidentiality');
  if (/\b(indemnif|indemnification)\b/.test(qLower)) anchorTerms.push('indemnification');
  if (/\b(governing law|jurisdiction)\b/.test(qLower)) anchorTerms.push('governing law', 'jurisdiction');

  // Query expansion improves recall for legal docs where the question's phrasing
  // doesn't match the document's phrasing (e.g., "financial covenant" vs "Total Debt to EBITDA").
  const expandedTerms: string[] = [];
  if (qLower.includes('covenant')) {
    expandedTerms.push(
      'covenants',
      'financial covenants',
      'affirmative covenants',
      'negative covenants',
      'reporting covenants',
      'total debt to ebitda',
      'net debt to ebitda',
      'leverage ratio',
      'ratio',
      'section',
    );
  }
  if (qLower.includes('ebitda')) expandedTerms.push('total debt to ebitda', 'leverage ratio');
  const expandedQuery = expandedTerms.length ? `${q}\n\n${expandedTerms.join(' ')}` : q;
  const anchorQuery = anchorTerms.length ? anchorTerms.join(' ') : '';

  // Vector query embedding
  const embedded = await embedTexts([expandedQuery]);
  const queryVec = embedded.vectors[0];
  if (!queryVec || queryVec.length === 0) {
    throw new Error('Failed to embed query');
  }
  const vecLit = toVectorLiteral(queryVec);

  type Row = {
    id: string;
    chunkIndex: number;
    startOffset: number | null;
    endOffset: number | null;
    text: string;
    keywordRank: number | null;
    vectorDistance: number | null;
  };

  const keywordRows: Row[] =
    keywordLimit > 0
      ? ((await prisma.$queryRawUnsafe(
          `
          SELECT
            "id",
            "chunkIndex",
            "startOffset",
            "endOffset",
            "text",
            ts_rank_cd(
              to_tsvector('english', coalesce("text", '')),
              plainto_tsquery('english', $1)
            ) AS "keywordRank",
            NULL::double precision AS "vectorDistance"
          FROM "CompanyDocumentChunk"
          WHERE "documentId" = $2
            AND to_tsvector('english', coalesce("text", '')) @@ plainto_tsquery('english', $1)
          ORDER BY "keywordRank" DESC
          LIMIT $3
        `,
          expandedQuery,
          documentId,
          keywordLimit,
        )) as Row[])
      : [];

  // Secondary keyword pass using anchor phrases if keyword recall is weak.
  const anchorKeywordRows: Row[] =
    keywordLimit > 0 && anchorQuery && keywordRows.length < Math.max(4, Math.floor(keywordLimit * 0.2))
      ? ((await prisma.$queryRawUnsafe(
          `
          SELECT
            "id",
            "chunkIndex",
            "startOffset",
            "endOffset",
            "text",
            ts_rank_cd(
              to_tsvector('english', coalesce("text", '')),
              plainto_tsquery('english', $1)
            ) AS "keywordRank",
            NULL::double precision AS "vectorDistance"
          FROM "CompanyDocumentChunk"
          WHERE "documentId" = $2
            AND to_tsvector('english', coalesce("text", '')) @@ plainto_tsquery('english', $1)
          ORDER BY "keywordRank" DESC
          LIMIT $3
        `,
          anchorQuery,
          documentId,
          Math.min(keywordLimit, 15),
        )) as Row[])
      : [];

  const vectorRows: Row[] =
    vectorLimit > 0
      ? ((await prisma.$queryRawUnsafe(
          `
          SELECT
            "id",
            "chunkIndex",
            "startOffset",
            "endOffset",
            "text",
            NULL::double precision AS "keywordRank",
            ("embedding" <-> $1::vector) AS "vectorDistance"
          FROM "CompanyDocumentChunk"
          WHERE "documentId" = $2
          ORDER BY "vectorDistance" ASC
          LIMIT $3
        `,
          vecLit,
          documentId,
          vectorLimit,
        )) as Row[])
      : [];

  // Merge by id and compute a combined score.
  const byId = new Map<string, RetrievedChunk>();

  function upsert(row: Row) {
    const prev = byId.get(row.id);
    const next: RetrievedChunk = prev || {
      id: row.id,
      chunkIndex: Number(row.chunkIndex) || 0,
      startOffset: row.startOffset ?? null,
      endOffset: row.endOffset ?? null,
      text: String(row.text || ''),
      score: 0,
      keywordRank: null,
      vectorDistance: null,
    };

    if (typeof row.keywordRank === 'number') next.keywordRank = row.keywordRank;
    if (typeof row.vectorDistance === 'number') next.vectorDistance = row.vectorDistance;

    byId.set(row.id, next);
  }

  for (const r of keywordRows) upsert(r);
  for (const r of anchorKeywordRows) upsert(r);
  for (const r of vectorRows) upsert(r);

  const merged = Array.from(byId.values());
  if (merged.length === 0) {
    return {
      chunks: [],
      debug: { keyword: keywordRows.length + anchorKeywordRows.length, vector: vectorRows.length },
    };
  }

  // Normalize ranks into [0,1] scores.
  const maxKeyword = Math.max(...merged.map((c) => c.keywordRank || 0));
  const minDist = Math.min(...merged.map((c) => (typeof c.vectorDistance === 'number' ? c.vectorDistance : Infinity)).filter(Number.isFinite));
  const maxDist = Math.max(...merged.map((c) => (typeof c.vectorDistance === 'number' ? c.vectorDistance : -Infinity)).filter(Number.isFinite));

  for (const c of merged) {
    const kw = c.keywordRank && maxKeyword > 0 ? c.keywordRank / maxKeyword : 0;
    let vec = 0;
    if (typeof c.vectorDistance === 'number' && Number.isFinite(c.vectorDistance)) {
      // Lower distance is better.
      if (Number.isFinite(minDist) && Number.isFinite(maxDist) && maxDist > minDist) {
        vec = 1 - (c.vectorDistance - minDist) / (maxDist - minDist);
      } else {
        vec = 1;
      }
    }

    // Weight keywords slightly higher for legal docs (section numbers, defined terms).
    c.score = kw * 0.6 + vec * 0.4;
  }

  merged.sort((a, b) => b.score - a.score);
  const topScored = merged.slice(0, finalLimit);

  // Include neighbor chunks to avoid missing language spanning chunk boundaries.
  const wantedIndices = new Set<number>();
  const NEIGHBOR_WINDOW = 2;
  for (const c of topScored) {
    for (let d = -NEIGHBOR_WINDOW; d <= NEIGHBOR_WINDOW; d += 1) {
      wantedIndices.add(c.chunkIndex + d);
    }
  }
  const indices = Array.from(wantedIndices.values()).filter((n) => Number.isInteger(n) && n >= 0);
  indices.sort((a, b) => a - b);

  const neighborRows: Row[] =
    indices.length > 0
      ? ((await prisma.$queryRawUnsafe(
          `
          SELECT
            "id",
            "chunkIndex",
            "startOffset",
            "endOffset",
            "text",
            NULL::double precision AS "keywordRank",
            NULL::double precision AS "vectorDistance"
          FROM "CompanyDocumentChunk"
          WHERE "documentId" = $1
            AND "chunkIndex" = ANY($2::int[])
          ORDER BY "chunkIndex" ASC
        `,
          documentId,
          indices,
        )) as Row[])
      : [];

  // Merge neighbors, preserving the original scores where available.
  const finalById = new Map<string, RetrievedChunk>();
  for (const c of topScored) finalById.set(c.id, c);
  for (const r of neighborRows) {
    const existing = finalById.get(r.id);
    if (existing) continue;
    finalById.set(r.id, {
      id: r.id,
      chunkIndex: Number(r.chunkIndex) || 0,
      startOffset: r.startOffset ?? null,
      endOffset: r.endOffset ?? null,
      text: String(r.text || ''),
      score: 0.05, // small baseline
      keywordRank: null,
      vectorDistance: null,
    });
  }

  const final = Array.from(finalById.values()).sort((a, b) => a.chunkIndex - b.chunkIndex);
  return {
    chunks: final,
    debug: { keyword: keywordRows.length + anchorKeywordRows.length, vector: vectorRows.length },
  };
}

