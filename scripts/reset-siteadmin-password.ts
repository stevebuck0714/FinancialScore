import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { hashPassword } from '../lib/auth';

/**
 * Dev helper: force-reset the SITEADMIN user's password in the DB
 * to match SITEADMIN_PASSWORD from `.env.local`.
 *
 * Why: `SITEADMIN_PASSWORD` is only used during seeding; if the user
 * already exists, changing `.env.local` won't update the DB hash.
 */
async function main() {
  // Ensure DATABASE_URL and SITEADMIN_* are available when run via CLI.
  dotenv.config({ path: '.env.local' });

  const email = (process.env.SITEADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SITEADMIN_PASSWORD || '';
  const disableMfa =
    process.argv.includes('--disable-mfa') || process.env.DISABLE_MFA === 'true';

  if (!email) {
    throw new Error('SITEADMIN_EMAIL is missing. Set it in `.env.local`.');
  }
  if (!password) {
    throw new Error('SITEADMIN_PASSWORD is missing. Set it in `.env.local`.');
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await hashPassword(password);

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true },
    });

    if (!existing) {
      // If the admin user doesn't exist, create it (same behavior as seed.ts).
      await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: 'Site Administrator',
          role: 'SITEADMIN',
          ...(disableMfa
            ? {
                mfaEnabled: false,
                mfaSecret: null,
                backupCodes: null,
              }
            : {}),
        },
      });
      console.log('✅ Created site admin user and set password (email only):', email);
      return;
    }

    await prisma.user.update({
      where: { email },
      data: {
        passwordHash,
        // Clearing reset token avoids confusing stale reset flows.
        passwordResetToken: null,
        passwordResetExpires: null,
        ...(disableMfa
          ? {
              mfaEnabled: false,
              mfaSecret: null,
              backupCodes: null,
            }
          : {}),
      },
    });

    console.log(
      `✅ Updated site admin password in DB for: ${email}${disableMfa ? ' (MFA disabled)' : ''}`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ Failed to reset site admin password:', err?.message || err);
  process.exit(1);
});

