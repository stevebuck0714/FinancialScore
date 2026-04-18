import * as fs from 'fs';
import * as path from 'path';
(function loadDotenvLocal() {
  const p = path.resolve(process.cwd(), '.env.local');
  const txt = fs.readFileSync(p, 'utf8');
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[key] = val;
  }
})();

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const cols = await prisma.$queryRawUnsafe<Array<{table_name:string; column_name:string; data_type:string}>>(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_name IN ('InforSyncTask','InforSyncRun')
       ORDER BY table_name, ordinal_position`
  );
  let last = '';
  for (const c of cols) {
    if (c.table_name !== last) { console.log('\n' + c.table_name); last = c.table_name; }
    console.log(`  ${c.column_name.padEnd(28)} ${c.data_type}`);
  }
}
main().catch(console.error).finally(()=>prisma.$disconnect());
