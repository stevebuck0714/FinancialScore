import crypto from 'crypto';
import { hashPassword } from '@/lib/auth';

function getArgValue(flag: string): string | undefined {
  // Support both: --flag value  AND  --flag=value
  const eqPrefix = `${flag}=`;
  const eqMatch = process.argv.find((v) => v.startsWith(eqPrefix));
  if (eqMatch) return eqMatch.slice(eqPrefix.length);

  const idx = process.argv.findIndex((v) => v === flag);
  if (idx === -1) return undefined;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return undefined;
  return next;
}

function generateStrongPassword(): string {
  // Deterministic structure for complexity + readability.
  const rand = crypto.randomBytes(9).toString('base64url'); // 12-ish chars
  const digits = String(Math.floor(Math.random() * 9000) + 1000);
  return `DevAdmin!${digits}-${rand}A1`;
}

async function main() {
  // Ensure dotenv precedence matches app server behavior.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: '.env.local', override: true });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: '.env', override: false });

  const databaseUrl = process.env.DATABASE_URL || '';
  const email = (getArgValue('--email') || process.env.SITEADMIN_EMAIL || 'admin@dev.local')
    .toLowerCase()
    .trim();

  const requestedPassword = getArgValue('--password');
  const password = requestedPassword || generateStrongPassword();

  const unsafeProdMarkers = ['orange-poetry', 'aged-snow'];
  const isLikelyProd = unsafeProdMarkers.some((m) => databaseUrl.includes(m));
  if (isLikelyProd && process.env.ALLOW_PROD_ADMIN_RESET !== '1') {
    throw new Error(
      'Refusing to run against a production database. If you REALLY intend this, set ALLOW_PROD_ADMIN_RESET=1 explicitly.'
    );
  }

  const passwordHash = await hashPassword(password);

  // Import Prisma only after env is loaded (prisma.ts enforces DB security on init).
  const { default: prisma } = await import('@/lib/prisma');

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: 'SITEADMIN',
      // Keep existing profile fields; ensure not tied to a tenant.
      companyId: null,
      consultantId: null,
      userType: null,
      companyRole: null,
    },
    create: {
      email,
      passwordHash,
      name: 'Dev Site Administrator',
      role: 'SITEADMIN',
      userType: null,
      companyId: null,
      consultantId: null,
      isPrimaryContact: false,
      companyRole: null,
    },
    select: { id: true, email: true, role: true },
  });

  // Print only what the operator needs to log in.
  // (Yes, this is sensitive; this script is intended to be run locally by the developer.)
  console.log('✅ Dev site admin credentials ready');
  console.log('Email:', user.email);
  console.log('Password:', password);
  console.log('Role:', user.role);
}

main()
  .catch((err) => {
    console.error('❌ Failed to create/reset dev site admin:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const { default: prisma } = await import('@/lib/prisma');
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  });

