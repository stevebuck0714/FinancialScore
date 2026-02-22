import assert from 'node:assert/strict';
import {
  getPresentInforSharedCredentialEnvKeys,
  shouldAllowInforM3EnvFallback,
  validateInforM3ProductionConfig,
} from '@/lib/infor-m3/security-config';

function testProductionAlwaysDisablesEnvFallback() {
  const result = shouldAllowInforM3EnvFallback({
    NODE_ENV: 'production',
    INFOR_M3_ALLOW_ENV_FALLBACK: 'true',
  });

  assert.equal(result, false, 'Env fallback must be blocked in production');
}

function testNonProductionRespectsExplicitFalse() {
  const result = shouldAllowInforM3EnvFallback({
    NODE_ENV: 'development',
    INFOR_M3_ALLOW_ENV_FALLBACK: 'false',
  });

  assert.equal(result, false, 'Env fallback false should be honored in non-production');
}

function testProductionValidationFlagsMisconfiguration() {
  const validation = validateInforM3ProductionConfig({
    NODE_ENV: 'production',
    INFOR_M3_ALLOW_ENV_FALLBACK: 'true',
    INFOR_M3_CLIENT_ID: 'shared-client',
    INFOR_M3_CLIENT_SECRET: 'shared-secret',
  });

  assert.equal(validation.ok, false, 'Production config validation should fail on bad config');
  assert.ok(
    validation.errors.some((error) => error.includes('INFOR_M3_ALLOW_ENV_FALLBACK')),
    'Expected fallback configuration error'
  );
  assert.ok(
    validation.errors.some((error) => error.includes('INFOR_M3_CLIENT_ID')),
    'Expected shared credential key error'
  );
}

function testSharedKeyDetection() {
  const keys = getPresentInforSharedCredentialEnvKeys({
    INFOR_M3_CLIENT_ID: 'abc',
    INFOR_M3_CLIENT_SECRET: '  ',
    INFOR_M3_SERVICE_ACCOUNT_ACCESS_KEY: 'svc-key',
  });

  assert.deepEqual(keys, ['INFOR_M3_CLIENT_ID', 'INFOR_M3_SERVICE_ACCOUNT_ACCESS_KEY']);
}

function run() {
  testProductionAlwaysDisablesEnvFallback();
  testNonProductionRespectsExplicitFalse();
  testProductionValidationFlagsMisconfiguration();
  testSharedKeyDetection();
  console.log('Infor security tests passed.');
}

run();
