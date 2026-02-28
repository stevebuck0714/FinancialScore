const SHARED_INFOR_CREDENTIAL_ENV_KEYS = [
  'INFOR_M3_TENANT_ID',
  'INFOR_M3_CLIENT_NAME',
  'INFOR_M3_CLIENT_ID',
  'INFOR_M3_CLIENT_SECRET',
  'INFOR_M3_IONAPI_BASE_URL',
  'INFOR_M3_SSO_BASE_URL',
  'INFOR_M3_OAUTH_AUTH_PATH',
  'INFOR_M3_OAUTH_TOKEN_PATH',
  'INFOR_M3_OAUTH_REVOKE_PATH',
  'INFOR_M3_SERVICE_ACCOUNT_ACCESS_KEY',
  'INFOR_M3_SERVICE_ACCOUNT_SECRET_KEY',
] as const;

export function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
}

export function shouldAllowInforM3EnvFallback(env: NodeJS.ProcessEnv = process.env): boolean {
  // Never allow env fallback in production, even if a flag is misconfigured.
  if (isProductionEnvironment(env)) {
    return false;
  }

  return env.INFOR_M3_ALLOW_ENV_FALLBACK !== 'false';
}

export function getPresentInforSharedCredentialEnvKeys(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  return SHARED_INFOR_CREDENTIAL_ENV_KEYS.filter((key) => {
    const value = env[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

export function validateInforM3ProductionConfig(env: NodeJS.ProcessEnv = process.env): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!isProductionEnvironment(env)) {
    return { ok: true, errors };
  }

  if (env.INFOR_M3_ALLOW_ENV_FALLBACK !== 'false') {
    errors.push('INFOR_M3_ALLOW_ENV_FALLBACK must be explicitly set to "false" in production.');
  }

  const presentSharedKeys = getPresentInforSharedCredentialEnvKeys(env);
  if (presentSharedKeys.length > 0) {
    errors.push(
      `Shared INFOR_M3_* credential env vars must not be set in production: ${presentSharedKeys.join(', ')}`
    );
  }

  return { ok: errors.length === 0, errors };
}
