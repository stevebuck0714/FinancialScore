import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { callInforIonApi } from '../lib/infor-m3/client';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

function extractItems(body: unknown): Array<Record<string, unknown>> {
  if (!body || typeof body !== 'object') return [];
  const b = body as any;
  if (Array.isArray(b.Items)) return b.Items;
  if (Array.isArray(b.items)) return b.items;
  if (Array.isArray(b.records)) return b.records;
  return [];
}

function looksTrial(text: unknown): boolean {
  const t = String(text || '').toLowerCase();
  return (
    t.includes('trial balance') ||
    t.includes('trialbalance') ||
    t.includes('multifsbtrialbalance') ||
    t.includes('fsb trial') ||
    t.includes('tb report')
  );
}

function parseCsiDateTime(value: unknown): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  return new Date(
    Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
      Number(m[7] || 0),
    ),
  );
}

function minuteDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60000;
}

async function main() {
  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID }, select: { accountingSystem: true } });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(COMPANY_ID, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials available');
  const headers = { 'X-Infor-MongooseConfig': 'APR_PRD_LYN', 'X-Infor-Site': 'LYN' } as Record<string, string>;

  const historyPath =
    '/APR_PRD/CSI/IDORequestService/ido/load/BGTaskHistories?properties=TaskName,TaskDescription,RequestingUser,CreatedBy,SubmissionDate,StartDate,CompletionDate,CompletionStatus,TaskErrorMsg,TaskExecutable,DerReportOutputFilename,TaskParm,TaskParms1,TaskParms2,RowPointer&recordCap=200';
  const historyRes = await callInforIonApi(resolved.credentials, historyPath, { timeoutMs: 45000, headers });
  const historyItems = extractItems(historyRes.body);

  const trialCandidates = historyItems.filter((item) =>
    Object.values(item).some((value) => looksTrial(value)),
  );

  const documentPath =
    '/APR_PRD/CSI/IDORequestService/ido/load/DocumentObjects?properties=DocumentName,FileSpec,Description,CreateDate,RecordDate,CreatedBy,DocumentObject,DocumentType,DocumentExtension,RowPointer&recordCap=500';
  const docRes = await callInforIonApi(resolved.credentials, documentPath, { timeoutMs: 45000, headers });
  const docItems = extractItems(docRes.body);

  const trialDocDirectHits = docItems.filter((doc) => Object.values(doc).some((v) => looksTrial(v)));

  const joins: Array<Record<string, unknown>> = [];
  for (const task of trialCandidates) {
    const completion = parseCsiDateTime(task.CompletionDate || task.RecordDate || task.StartDate || task.SubmissionDate);
    const taskUser = String(task.RequestingUser || task.CreatedBy || '').trim().toLowerCase();
    if (!completion) continue;
    for (const doc of docItems) {
      const docDate = parseCsiDateTime(doc.CreateDate || doc.RecordDate);
      const docUser = String(doc.CreatedBy || '').trim().toLowerCase();
      if (!docDate) continue;
      const sameUser = taskUser && docUser && taskUser === docUser;
      const withinWindow = minuteDiff(completion, docDate) <= 15;
      const nameTie =
        looksTrial(doc.DocumentName) ||
        looksTrial(doc.Description) ||
        looksTrial(task.DerReportOutputFilename) ||
        String(task.DerReportOutputFilename || '').toLowerCase() === String(doc.FileSpec || '').toLowerCase();
      if ((sameUser && withinWindow) || nameTie) {
        joins.push({
          taskName: task.TaskName ?? null,
          taskExecutable: task.TaskExecutable ?? null,
          completionDate: task.CompletionDate ?? null,
          taskUser: task.RequestingUser ?? task.CreatedBy ?? null,
          taskOutputFile: task.DerReportOutputFilename ?? null,
          docName: doc.DocumentName ?? null,
          docFileSpec: doc.FileSpec ?? null,
          docDescription: doc.Description ?? null,
          docCreatedBy: doc.CreatedBy ?? null,
          docCreateDate: doc.CreateDate ?? doc.RecordDate ?? null,
          minutesApart: docDate ? minuteDiff(completion, docDate) : null,
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        companyId: COMPANY_ID,
        historyStatus: historyRes.status,
        historyCount: historyItems.length,
        trialTaskCount: trialCandidates.length,
        trialTasks: trialCandidates.slice(0, 40),
        documentStatus: docRes.status,
        documentCount: docItems.length,
        trialDocDirectHits: trialDocDirectHits.slice(0, 40),
        joinCandidates: joins.slice(0, 80),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
