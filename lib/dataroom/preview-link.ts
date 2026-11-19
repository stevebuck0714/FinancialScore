import { createHmac, timingSafeEqual } from 'crypto';

/** Long enough for Microsoft/Google viewers to fetch the file, short enough that a leaked link dies quickly. */
const PREVIEW_LINK_TTL_SECONDS = 15 * 60;

function signingKey(): string {
  const secret = String(process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || '').trim();
  if (!secret) throw new Error('Auth secret is not configured.');
  return `dataroom-preview:${secret}`;
}

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

/** Token for /api/public/dataroom-preview/[token], used only to hand private Office files to web viewers. */
export function createDataRoomPreviewToken(documentId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ d: documentId, e: Math.floor(Date.now() / 1000) + PREVIEW_LINK_TTL_SECONDS }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyDataRoomPreviewToken(token: string): string | null {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { d, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { d?: unknown; e?: unknown };
    if (typeof d !== 'string' || !d || typeof e !== 'number' || e < Date.now() / 1000) return null;
    return d;
  } catch {
    return null;
  }
}
