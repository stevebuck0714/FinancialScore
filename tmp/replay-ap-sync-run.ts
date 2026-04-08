import { transformInforM3RawRun } from '../lib/infor-m3/operational-sync';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const syncRunId = process.argv[3] || 'a10a5719-cbe1-4712-9f76-4cbea2a7b7d8';
  const frequency = (process.argv[4] as 'daily' | 'weekly' | 'monthly') || 'daily';

  const result = await transformInforM3RawRun({
    companyId,
    syncRunId,
    frequency,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
