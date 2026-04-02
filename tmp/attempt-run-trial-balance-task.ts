import prisma from '../lib/prisma';
import { getInforM3CredentialsWithOptionalEnvFallback } from '../lib/infor-m3/credentials';
import { requestInforM3AccessToken } from '../lib/infor-m3/client';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const TASK_NAME = process.argv[3] || 'MultiFSBTrialBalance';

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${normalizedBase}${normalizedPath}`;
}

async function callPost(
  ionBaseUrl: string,
  accessToken: string,
  path: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const url = joinUrl(ionBaseUrl, path);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Infor-MongooseConfig': 'APR_PRD_LYN',
      'X-Infor-Site': 'LYN',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep raw text
  }
  return {
    status: response.status,
    ok: response.ok,
    url,
    body: parsed,
  };
}

async function main() {
  const company = await prisma.company.findUnique({
    where: { id: COMPANY_ID },
    select: { accountingSystem: true },
  });
  const inforSystem = String(company?.accountingSystem || '').toUpperCase().includes('CSI') ? 'INFOR_CSI' : 'INFOR_M3';
  const resolved = await getInforM3CredentialsWithOptionalEnvFallback(COMPANY_ID, inforSystem as any);
  if (!resolved.credentials) throw new Error('No CSI credentials available');

  const token = await requestInforM3AccessToken(resolved.credentials, 20000);
  if (!token.ok) throw new Error(`Token failure: ${token.error || 'unknown'} ${token.errorDescription || ''}`);

  const attempts: Array<{ name: string; path: string; body: unknown }> = [
    {
      name: 'invoke_submitbackgroundtask_v1',
      path: '/APR_PRD/CSI/IDORequestService/ido/invoke/BGTaskDefinitions/SubmitBackgroundTask',
      body: { TaskName: TASK_NAME },
    },
    {
      name: 'invoke_submitbackgroundtask_v2',
      path: '/APR_PRD/CSI/IDORequestService/ido/invoke/BGTaskDefinitions/SubmitBackgroundTask',
      body: { Parameters: [TASK_NAME] },
    },
    {
      name: 'invoke_runbackgroundtask_v1',
      path: '/APR_PRD/CSI/IDORequestService/ido/invoke/BGTaskDefinitions/RunBackgroundTask',
      body: { TaskName: TASK_NAME },
    },
    {
      name: 'invoke_performtask_v1',
      path: '/APR_PRD/CSI/IDORequestService/ido/invoke/BGTaskDefinitions/PerformTask',
      body: { TaskName: TASK_NAME },
    },
    {
      name: 'json_invoke_submit',
      path: '/APR_PRD/CSI/IDORequestService/json/ido/invoke/BGTaskDefinitions/SubmitBackgroundTask',
      body: { TaskName: TASK_NAME },
    },
  ];

  const results: Array<Record<string, unknown>> = [];
  for (const attempt of attempts) {
    try {
      const res = await callPost(resolved.credentials.ionApiBaseUrl, token.accessToken, attempt.path, attempt.body);
      results.push({ attempt: attempt.name, path: attempt.path, requestBody: attempt.body, ...res });
    } catch (error) {
      results.push({
        attempt: attempt.name,
        path: attempt.path,
        requestBody: attempt.body,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify({ companyId: COMPANY_ID, taskName: TASK_NAME, attempts: results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
