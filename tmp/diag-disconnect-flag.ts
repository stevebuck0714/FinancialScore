import * as fs from 'fs';
import * as path from 'path';
(function load(){const p=path.resolve('.env.local');const t=fs.readFileSync(p,'utf8');for(const r of t.split(/\r?\n/)){const l=r.trim();if(!l||l.startsWith('#'))continue;const e=l.indexOf('=');if(e<=0)continue;const k=l.slice(0,e).trim();let v=l.slice(e+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);process.env[k]=v;}})();
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const CONN='cmmzih9p10004qhjwxlgui0sc';

async function main() {
  const c = await prisma.accountingConnection.findUnique({
    where: { id: CONN },
    select: { connectionMetadata: true }
  });
  const md: any = c?.connectionMetadata || {};
  console.log('inforManualDisconnect:', JSON.stringify(md.inforManualDisconnect, null, 2));
  console.log('inforManualDisconnectAt:', md.inforManualDisconnectAt);
  console.log('inforManualDisconnectReason:', md.inforManualDisconnectReason);
  console.log('inforManualDisconnectBy:', md.inforManualDisconnectBy);
}
main().catch(console.error).finally(()=>prisma.$disconnect());
