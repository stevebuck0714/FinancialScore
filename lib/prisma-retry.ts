import prisma from '@/lib/prisma';

const TRANSIENT_PRISMA_TOKENS = [
  'P1017',
  'Connection has not been opened',
  'bytes remaining on stream',
  'ECONNRESET',
];

function isTransientPrismaError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.message}\n${error.stack || ''}`
      : String(error || '');
  return TRANSIENT_PRISMA_TOKENS.some((token) => message.includes(token));
}

export async function withPrismaReconnectRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientPrismaError(error)) throw error;
    console.warn(`[PrismaRetry] ${operationName} failed with transient Prisma error; reconnecting and retrying once.`);
    try {
      await prisma.$disconnect();
    } catch {
      // Best effort: disconnect can fail when engine is already down.
    }
    await prisma.$connect();
    return operation();
  }
}

