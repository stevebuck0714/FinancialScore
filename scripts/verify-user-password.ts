import { verifyPassword } from '@/lib/auth';

function getArgValue(flag: string): string | undefined {
  const eqPrefix = `${flag}=`;
  const eqMatch = process.argv.find((v) => v.startsWith(eqPrefix));
  if (eqMatch) return eqMatch.slice(eqPrefix.length);

  const idx = process.argv.findIndex((v) => v === flag);
  if (idx === -1) return undefined;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return undefined;
  return next;
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: '.env.local', override: true });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: '.env', override: false });

  const emailRaw = getArgValue('--email');
  const password = getArgValue('--password');
  if (!emailRaw || !password) {
    throw new Error('Usage: npx tsx scripts/verify-user-password.ts --email you@x.com --password "..."');
  }

  const email = emailRaw.toLowerCase().trim();
  const { default: prisma } = await import('@/lib/prisma');
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, mfaEnabled: true, passwordHash: true },
  });

  if (!user) {
    console.log('User not found:', email);
    return;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  console.log('User:', { email: user.email, role: user.role, mfaEnabled: user.mfaEnabled });
  console.log('Password ok:', ok);
}

main()
  .catch((err) => {
    console.error('❌ Verify failed:', err?.message || err);
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

