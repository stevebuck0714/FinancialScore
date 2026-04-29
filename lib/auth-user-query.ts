import { Pool } from 'pg';

type AuthUserRecord = {
  id: string;
  email: string;
  name: string;
  role: string;
  userType: string | null;
  companyRole: string | null;
  companyId: string | null;
  consultantId: string | null;
  isPrimaryContact: boolean;
  mfaEnabled: boolean;
  passwordHash: string | null;
  company: {
    affiliateCode: string | null;
    subscriptionStatus: string | null;
    nextBillingDate: Date | null;
    consultantId: string | null;
  } | null;
  primaryConsultant: {
    id: string;
  } | null;
};

declare global {
  // eslint-disable-next-line no-var
  var authUserQueryPool: Pool | undefined;
}

function getPool(): Pool {
  if (globalThis.authUserQueryPool) return globalThis.authUserQueryPool;

  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  const pool = new Pool({
    connectionString,
    max: 5,
  });

  globalThis.authUserQueryPool = pool;
  return pool;
}

export async function findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
  const pool = getPool();
  const result = await pool.query(
    `
      SELECT
        u.id,
        u.email,
        u.name,
        u.role::text AS role,
        u."userType"::text AS "userType",
        u."companyRole" AS "companyRole",
        u."companyId" AS "companyId",
        u."consultantId" AS "consultantId",
        u."isPrimaryContact" AS "isPrimaryContact",
        u."mfaEnabled" AS "mfaEnabled",
        u."passwordHash" AS "passwordHash",
        c."affiliateCode" AS "companyAffiliateCode",
        c."subscriptionStatus" AS "companySubscriptionStatus",
        c."nextBillingDate" AS "companyNextBillingDate",
        c."consultantId" AS "companyConsultantId",
        pc.id AS "primaryConsultantId"
      FROM "User" u
      LEFT JOIN "Company" c
        ON c.id = u."companyId"
      LEFT JOIN "Consultant" pc
        ON pc."userId" = u.id
      WHERE u.email = $1
      LIMIT 1
    `,
    [email]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name || ''),
    role: String(row.role),
    userType: row.userType == null ? null : String(row.userType),
    companyRole: row.companyRole == null ? null : String(row.companyRole),
    companyId: row.companyId == null ? null : String(row.companyId),
    consultantId: row.consultantId == null ? null : String(row.consultantId),
    isPrimaryContact: Boolean(row.isPrimaryContact),
    mfaEnabled: Boolean(row.mfaEnabled),
    passwordHash: row.passwordHash == null ? null : String(row.passwordHash),
    company:
      row.companyAffiliateCode != null ||
      row.companySubscriptionStatus != null ||
      row.companyNextBillingDate != null ||
      row.companyConsultantId != null
        ? {
            affiliateCode: row.companyAffiliateCode == null ? null : String(row.companyAffiliateCode),
            subscriptionStatus: row.companySubscriptionStatus == null ? null : String(row.companySubscriptionStatus),
            nextBillingDate: row.companyNextBillingDate ? new Date(row.companyNextBillingDate) : null,
            consultantId: row.companyConsultantId == null ? null : String(row.companyConsultantId),
          }
        : null,
    primaryConsultant: row.primaryConsultantId == null ? null : { id: String(row.primaryConsultantId) },
  };
}

