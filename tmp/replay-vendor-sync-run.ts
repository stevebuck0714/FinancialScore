import { transformInforM3RawRun } from '../lib/infor-m3/operational-sync';

async function main() {
  const result = await transformInforM3RawRun({
    companyId: 'cmmnwyofv000fqhp4z8lebbny',
    syncRunId: '06579346-9a94-41eb-9cf4-c148f60068f3',
    frequency: 'daily',
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
