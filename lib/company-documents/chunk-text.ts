type TextChunk = {
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  text: string;
};

export function chunkDocumentText(params: {
  text: string;
  // Roughly ~800-1200 tokens; without a tokenizer we approximate by characters.
  targetChars?: number;
  overlapChars?: number;
  minChunkChars?: number;
}): TextChunk[] {
  const raw = String(params.text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];

  const targetChars = Math.max(1200, Math.min(8000, params.targetChars ?? 4200));
  const overlapChars = Math.max(0, Math.min(2000, params.overlapChars ?? 500));
  const minChunkChars = Math.max(200, Math.min(targetChars, params.minChunkChars ?? 800));

  // Prefer paragraph boundaries when possible.
  const paragraphs = raw
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: TextChunk[] = [];
  let cursor = 0;

  // If paragraphs are extremely long (common in PDFs), fall back to sliding window.
  const tooFewParagraphs = paragraphs.length <= 2 && raw.length > targetChars * 2;
  if (tooFewParagraphs) {
    while (cursor < raw.length) {
      const end = Math.min(raw.length, cursor + targetChars);
      const slice = raw.slice(cursor, end).trim();
      if (slice.length >= minChunkChars) {
        chunks.push({
          chunkIndex: chunks.length,
          startOffset: cursor,
          endOffset: end,
          text: slice,
        });
      }
      if (end >= raw.length) break;
      cursor = Math.max(0, end - overlapChars);
    }
    return chunks;
  }

  let currentText = '';
  let currentStart = 0;
  let currentEnd = 0;

  function flush() {
    const t = currentText.trim();
    if (t.length >= minChunkChars) {
      chunks.push({
        chunkIndex: chunks.length,
        startOffset: currentStart,
        endOffset: currentEnd,
        text: t,
      });
    }
    currentText = '';
    currentStart = currentEnd;
  }

  for (const p of paragraphs) {
    // Find paragraph offset in original text after the current cursor.
    const idx = raw.indexOf(p, cursor);
    const pStart = idx >= 0 ? idx : cursor;
    const pEnd = pStart + p.length;
    cursor = pEnd;

    const candidate = currentText ? `${currentText}\n\n${p}` : p;
    if (candidate.length <= targetChars) {
      if (!currentText) currentStart = pStart;
      currentText = candidate;
      currentEnd = pEnd;
      continue;
    }

    // Flush current chunk.
    flush();

    // Start new chunk with overlap from previous chunk tail, if available.
    if (overlapChars > 0 && chunks.length > 0) {
      const prev = chunks[chunks.length - 1];
      const overlap = prev.text.slice(Math.max(0, prev.text.length - overlapChars));
      currentText = overlap ? `${overlap}\n\n${p}` : p;
      currentStart = Math.max(0, pStart - overlap.length);
      currentEnd = pEnd;
    } else {
      currentText = p;
      currentStart = pStart;
      currentEnd = pEnd;
    }

    // If a single paragraph is gigantic, split it with sliding windows.
    if (currentText.length > targetChars * 1.5) {
      const big = currentText;
      let localCursor = 0;
      while (localCursor < big.length) {
        const end = Math.min(big.length, localCursor + targetChars);
        const slice = big.slice(localCursor, end).trim();
        if (slice.length >= minChunkChars) {
          chunks.push({
            chunkIndex: chunks.length,
            startOffset: currentStart + localCursor,
            endOffset: currentStart + end,
            text: slice,
          });
        }
        if (end >= big.length) break;
        localCursor = Math.max(0, end - overlapChars);
      }
      currentText = '';
      currentStart = pEnd;
      currentEnd = pEnd;
    }
  }

  if (currentText.trim()) flush();
  return chunks;
}

