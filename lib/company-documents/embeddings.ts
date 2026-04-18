import {
  getAiProviderOptions,
  getOpenAiClient,
  resolveModelName,
} from '@/lib/ai-gateway';

function getEmbeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
}

export type EmbedResult = {
  model: string;
  vectors: number[][];
};

export async function embedTexts(texts: string[]): Promise<EmbedResult> {
  const model = resolveModelName(getEmbeddingModel());
  const openai = getOpenAiClient();
  const providerOptions = getAiProviderOptions();

  // Batch to keep request sizes reasonable.
  const BATCH_SIZE = 64;
  const vectors: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) => String(t || '').slice(0, 12_000));
    const resp = await openai.embeddings.create({
      model,
      input: batch,
      ...(providerOptions ? ({ providerOptions } as Record<string, unknown>) : {}),
    } as Parameters<typeof openai.embeddings.create>[0]);
    for (const item of resp.data) {
      vectors.push(item.embedding as unknown as number[]);
    }
  }

  return { model, vectors };
}
