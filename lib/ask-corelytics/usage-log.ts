import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';

export type AskUsageRecord = {
  companyId: string;
  model: string;
  reasoningEffort: string | null;
  outcome: string;
  rounds: number;
  toolCalls: number;
  promptTokens: number;
  cachedPromptTokens: number;
  cacheWriteTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  gatewayCostUsd: number | null;
  questionChars: number;
  contextChars: number;
  toolResultChars: number;
  totalMs: number;
};

let ensurePromise: Promise<void> | null = null;

async function ensureAskUsageTable(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AskCorelyticsUsage" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT NOT NULL,
          "model" TEXT NOT NULL,
          "reasoningEffort" TEXT,
          "outcome" TEXT NOT NULL,
          "rounds" INTEGER NOT NULL,
          "toolCalls" INTEGER NOT NULL,
          "promptTokens" INTEGER NOT NULL,
          "cachedPromptTokens" INTEGER NOT NULL,
          "cacheWriteTokens" INTEGER NOT NULL,
          "completionTokens" INTEGER NOT NULL,
          "reasoningTokens" INTEGER NOT NULL,
          "gatewayCostUsd" DOUBLE PRECISION,
          "questionChars" INTEGER NOT NULL,
          "contextChars" INTEGER NOT NULL,
          "toolResultChars" INTEGER NOT NULL,
          "totalMs" INTEGER NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "AskCorelyticsUsage_company_created_idx"
        ON "AskCorelyticsUsage"("companyId", "createdAt")
      `);
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

/** Token totals for one Ask question (all agent rounds). Question text is never stored. */
export async function recordAskUsage(record: AskUsageRecord): Promise<void> {
  try {
    await ensureAskUsageTable();
    await prisma.$executeRaw`
      INSERT INTO "AskCorelyticsUsage" (
        "id", "companyId", "model", "reasoningEffort", "outcome", "rounds", "toolCalls",
        "promptTokens", "cachedPromptTokens", "cacheWriteTokens", "completionTokens", "reasoningTokens",
        "gatewayCostUsd", "questionChars", "contextChars", "toolResultChars", "totalMs"
      ) VALUES (
        ${randomUUID()}, ${record.companyId}, ${record.model}, ${record.reasoningEffort}, ${record.outcome},
        ${record.rounds}, ${record.toolCalls}, ${record.promptTokens}, ${record.cachedPromptTokens},
        ${record.cacheWriteTokens}, ${record.completionTokens}, ${record.reasoningTokens}, ${record.gatewayCostUsd},
        ${record.questionChars}, ${record.contextChars}, ${record.toolResultChars}, ${record.totalMs}
      )
    `;
  } catch (error) {
    console.error('Ask agent: failed to record usage', error instanceof Error ? error.message : error);
  }
}
