import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  openForecastMonths,
  vendorForecastNeedsRefresh,
} from '@/lib/operations/vendor-forecast-infor';
import { effectiveVendorForecastQty } from '@/lib/operations/vendor-monthly-forecast-db';

function testRefreshFreshnessGuard() {
  const now = new Date('2026-10-20T16:00:00.000Z');
  const sourceDate = new Date('2026-10-20T00:00:00.000Z');

  assert.equal(
    vendorForecastNeedsRefresh(
      { inforSourceDate: sourceDate, inforRefreshedAt: new Date('2026-10-20T12:00:00.000Z') },
      sourceDate,
      now
    ),
    false,
    'A same-source refresh completed today EST should be skipped.'
  );
  assert.equal(
    vendorForecastNeedsRefresh(
      { inforSourceDate: sourceDate, inforRefreshedAt: new Date('2026-10-19T16:00:00.000Z') },
      sourceDate,
      now
    ),
    true,
    'The first refresh on a new EST day should run.'
  );
  assert.equal(
    vendorForecastNeedsRefresh(
      { inforSourceDate: new Date('2026-10-19T00:00:00.000Z'), inforRefreshedAt: now },
      sourceDate,
      now
    ),
    true,
    'A newer Infor source load should run even if the prior refresh was today.'
  );
  assert.equal(vendorForecastNeedsRefresh(null, null, now), false, 'Missing source data cannot trigger a rebuild.');
}

function testCurrentAndNextPlanningMonths() {
  const october = new Date('2026-10-20T16:00:00.000Z');
  assert.deepEqual(openForecastMonths(2026, october), [10, 11, 12]);
  assert.deepEqual(openForecastMonths(2027, october), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
}

function testOverridesRemainEffective() {
  const effective = effectiveVendorForecastQty(
    { '1': 10, '2': 20, '3': 30 },
    { '2': 75 }
  );
  assert.equal(effective['1'], 10);
  assert.equal(effective['2'], 75, 'An approved user override must survive an Infor refresh.');
  assert.equal(effective['3'], 30);
}

function testVendorListRouteCannotBlockOnRebuild() {
  const routePath = path.join(process.cwd(), 'app', 'api', 'operational-data', 'vendor-forecast', 'route.ts');
  const source = fs.readFileSync(routePath, 'utf8');
  assert.doesNotMatch(
    source,
    /await ensureVendorForecastFromInfor/,
    'The interactive Vendor Monthly Forecast endpoint must not wait for an Infor rebuild.'
  );
}

function run() {
  testRefreshFreshnessGuard();
  testCurrentAndNextPlanningMonths();
  testOverridesRemainEffective();
  testVendorListRouteCannotBlockOnRebuild();
  console.log('Vendor Monthly Forecast loading tests passed.');
}

run();
