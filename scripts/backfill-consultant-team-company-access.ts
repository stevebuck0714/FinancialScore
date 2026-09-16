/**
 * Preserves existing consultant-team access before per-company assignment is
 * enforced. It is idempotent: existing access records are never modified.
 *
 * Run once after deploying the authorization change:
 *   npx tsx scripts/backfill-consultant-team-company-access.ts
 */
import prisma from '../lib/prisma';

async function backfillConsultantTeamCompanyAccess() {
  const teamMembers = await prisma.user.findMany({
    where: {
      role: 'CONSULTANT',
      isPrimaryContact: false,
      consultantId: { not: null },
    },
    select: { id: true, consultantId: true, email: true },
  });

  let created = 0;
  for (const member of teamMembers) {
    const companies = await prisma.company.findMany({
      where: { consultantId: member.consultantId! },
      select: { id: true },
    });
    if (companies.length === 0) continue;

    const result = await prisma.userCompanyAccess.createMany({
      data: companies.map((company) => ({
        userId: member.id,
        companyId: company.id,
        companyRole: 'user',
      })),
      skipDuplicates: true,
    });
    created += result.count;
    console.log(`${member.email}: preserved access to ${companies.length} company(s)`);
  }

  console.log(`Created ${created} missing team-company assignment(s).`);
}

backfillConsultantTeamCompanyAccess()
  .catch((error) => {
    console.error('Consultant-team access backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
