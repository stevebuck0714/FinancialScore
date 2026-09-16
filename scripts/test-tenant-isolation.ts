/**
 * SEC-01 Tenant Isolation Negative Test Suite
 *
 * Run: npx tsx scripts/test-tenant-isolation.ts
 * Or:  npm run test:tenant-isolation
 *
 * These tests exercise the pure authorization policy that mirrors
 * `lib/tenant-security.ts` server-side checks. They do not call live APIs
 * and do not use production data.
 */

import assert from 'node:assert/strict';
import {
  decideCompanyAccess,
  decideConsultantAccess,
} from '../lib/tenant-isolation-policy';

type CaseResult = {
  id: string;
  title: string;
  expected: boolean;
  actual: boolean;
  passed: boolean;
};

const results: CaseResult[] = [];

function runCase(id: string, title: string, expected: boolean, actual: boolean) {
  const passed = actual === expected;
  results.push({ id, title, expected, actual, passed });
  assert.equal(
    actual,
    expected,
    `${id}: ${title} — expected ${expected}, got ${actual}`
  );
}

function runNegativeCompanyAccessCases() {
  // NT-01: Company user cannot access another company's data.
  runCase(
    'NT-01',
    'USER active on Company A is denied Company B',
    false,
    decideCompanyAccess({
      role: 'USER',
      activeCompanyId: 'company-a',
      consultantId: null,
      membershipCompanyIds: ['company-a'],
      targetCompanyId: 'company-b',
      targetCompanyConsultantId: 'consultant-x',
    })
  );

  // NT-02: Company user without membership is denied foreign company.
  runCase(
    'NT-02',
    'USER with no memberships is denied Company B',
    false,
    decideCompanyAccess({
      role: 'USER',
      activeCompanyId: null,
      consultantId: null,
      membershipCompanyIds: [],
      targetCompanyId: 'company-b',
      targetCompanyConsultantId: null,
    })
  );

  // NT-03: Consultant cannot access another consultant's portfolio company.
  runCase(
    'NT-03',
    'CONSULTANT X is denied Company owned by CONSULTANT Y',
    false,
    decideCompanyAccess({
      role: 'CONSULTANT',
      activeCompanyId: null,
      consultantId: 'consultant-x',
      membershipCompanyIds: [],
      targetCompanyId: 'company-y',
      targetCompanyConsultantId: 'consultant-y',
    })
  );

  // NT-04: Consultant cannot access standalone business without explicit membership.
  runCase(
    'NT-04',
    'CONSULTANT is denied standalone business without membership',
    false,
    decideCompanyAccess({
      role: 'CONSULTANT',
      activeCompanyId: null,
      consultantId: 'consultant-x',
      membershipCompanyIds: [],
      targetCompanyId: 'standalone-business',
      targetCompanyConsultantId: null,
    })
  );

  // NT-05: Unauthenticated / null role is denied.
  runCase(
    'NT-05',
    'Null role is denied company access',
    false,
    decideCompanyAccess({
      role: null,
      activeCompanyId: 'company-a',
      consultantId: null,
      membershipCompanyIds: ['company-a'],
      targetCompanyId: 'company-a',
      targetCompanyConsultantId: null,
    })
  );

  // NT-06: A non-primary consultant needs an explicit company assignment.
  runCase(
    'NT-06',
    'Non-primary CONSULTANT is denied an unassigned firm company',
    false,
    decideCompanyAccess({
      role: 'CONSULTANT',
      activeCompanyId: null,
      consultantId: 'consultant-x',
      isPrimaryContact: false,
      membershipCompanyIds: [],
      targetCompanyId: 'company-x1',
      targetCompanyConsultantId: 'consultant-x',
    })
  );

  // NT-07: Empty target company id is denied.
  runCase(
    'NT-07',
    'Empty target company id is denied',
    false,
    decideCompanyAccess({
      role: 'USER',
      activeCompanyId: 'company-a',
      consultantId: null,
      membershipCompanyIds: ['company-a'],
      targetCompanyId: '',
      targetCompanyConsultantId: null,
    })
  );
}

function runNegativeConsultantAccessCases() {
  // NT-08: Company user cannot access consultant records.
  runCase(
    'NT-08',
    'USER is denied consultant access',
    false,
    decideConsultantAccess({
      role: 'USER',
      consultantId: null,
      targetConsultantId: 'consultant-x',
    })
  );

  // NT-09: Consultant cannot access a different consultant.
  runCase(
    'NT-09',
    'CONSULTANT X is denied CONSULTANT Y',
    false,
    decideConsultantAccess({
      role: 'CONSULTANT',
      consultantId: 'consultant-x',
      targetConsultantId: 'consultant-y',
    })
  );

  // NT-10: Null role is denied consultant access.
  runCase(
    'NT-10',
    'Null role is denied consultant access',
    false,
    decideConsultantAccess({
      role: null,
      consultantId: null,
      targetConsultantId: 'consultant-x',
    })
  );
}

function runPositiveControlCases() {
  // PC-01: User allowed for active company.
  runCase(
    'PC-01',
    'USER allowed for active company',
    true,
    decideCompanyAccess({
      role: 'USER',
      activeCompanyId: 'company-a',
      consultantId: null,
      membershipCompanyIds: [],
      targetCompanyId: 'company-a',
      targetCompanyConsultantId: null,
    })
  );

  // PC-02: User allowed via explicit membership (cross-company grant).
  runCase(
    'PC-02',
    'USER allowed via UserCompanyAccess membership',
    true,
    decideCompanyAccess({
      role: 'USER',
      activeCompanyId: 'company-a',
      consultantId: null,
      membershipCompanyIds: ['company-a', 'company-b'],
      targetCompanyId: 'company-b',
      targetCompanyConsultantId: null,
    })
  );

  // PC-03: Consultant allowed for owned portfolio company.
  runCase(
    'PC-03',
    'CONSULTANT allowed for owned portfolio company',
    true,
    decideCompanyAccess({
      role: 'CONSULTANT',
      activeCompanyId: null,
      consultantId: 'consultant-x',
      isPrimaryContact: true,
      membershipCompanyIds: [],
      targetCompanyId: 'company-x1',
      targetCompanyConsultantId: 'consultant-x',
    })
  );

  // PC-04: Consultant allowed via explicit membership to non-owned company.
  runCase(
    'PC-04',
    'CONSULTANT allowed via explicit membership',
    true,
    decideCompanyAccess({
      role: 'CONSULTANT',
      activeCompanyId: null,
      consultantId: 'consultant-x',
      membershipCompanyIds: ['standalone-business'],
      targetCompanyId: 'standalone-business',
      targetCompanyConsultantId: null,
    })
  );

  // PC-05: Site admin allowed for any company.
  runCase(
    'PC-05',
    'SITEADMIN allowed for foreign company',
    true,
    decideCompanyAccess({
      role: 'SITEADMIN',
      activeCompanyId: null,
      consultantId: null,
      membershipCompanyIds: [],
      targetCompanyId: 'any-company',
      targetCompanyConsultantId: 'consultant-y',
    })
  );

  // PC-06: Site admin allowed for any consultant.
  runCase(
    'PC-06',
    'SITEADMIN allowed for consultant access',
    true,
    decideConsultantAccess({
      role: 'SITEADMIN',
      consultantId: null,
      targetConsultantId: 'consultant-y',
    })
  );

  // PC-07: Consultant allowed for own consultant record.
  runCase(
    'PC-07',
    'CONSULTANT allowed for own consultant record',
    true,
    decideConsultantAccess({
      role: 'CONSULTANT',
      consultantId: 'consultant-x',
      targetConsultantId: 'consultant-x',
    })
  );
}

function run() {
  runNegativeCompanyAccessCases();
  runNegativeConsultantAccessCases();
  runPositiveControlCases();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('SEC-01 Tenant Isolation Negative Test Suite');
  console.log(`Executed: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  for (const result of results) {
    console.log(
      `${result.passed ? 'PASS' : 'FAIL'} ${result.id} expected=${result.expected} actual=${result.actual} :: ${result.title}`
    );
  }

  if (failed > 0) {
    process.exitCode = 1;
    throw new Error(`Tenant isolation suite failed: ${failed} case(s)`);
  }

  console.log('Tenant isolation tests passed.');
}

run();
