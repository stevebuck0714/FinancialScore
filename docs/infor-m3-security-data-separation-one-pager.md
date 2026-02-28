# Infor M3 Security & Data Separation One-Pager

## Objective

Support multiple Infor M3 customers with strict company isolation for credentials, API access, and financial data.

## Non-Negotiable Production Controls

- Use per-company credentials stored in `AccountingConnection.connectionMetadata`.
- Disable env fallback in production: `INFOR_M3_ALLOW_ENV_FALLBACK=false`.
- Do not set shared `INFOR_M3_*` credential env vars in production runtime.
- Require tenant authorization on every Infor API route (`resolveAuthorizedCompanyId` + `requireCompanyAccess`).

## Implemented Safeguards

1. **Production fallback hard-block**
   - `shouldAllowInforM3EnvFallback()` now always returns `false` in production.
   - This prevents shared env credentials from being used across companies.

2. **Build-time security gate**
   - `scripts/check-deploy-block.js` now fails production builds when:
     - `INFOR_M3_ALLOW_ENV_FALLBACK` is not exactly `"false"`, or
     - any shared `INFOR_M3_*` credential env vars are present.

3. **Reusable security config**
   - `lib/infor-m3/security-config.ts` centralizes:
     - production detection,
     - fallback policy decisions,
     - production config validation,
     - shared env key detection.

4. **Security regression checks**
   - `scripts/test-infor-security.ts` verifies fallback and config validation behavior.
   - Run with: `npm run test:infor-security`

## Operational Onboarding Process (Per Company)

1. Create production company record and assign authorized users.
2. Set accounting system to `INFOR_M3`.
3. Connect credentials with `POST /api/infor-m3/connect?companyId=<id>`.
4. Validate with:
   - `GET /api/infor-m3/status?companyId=<id>`
   - `GET /api/infor-m3/test-token?companyId=<id>`
   - `GET /api/infor-m3/probe?companyId=<id>&path=<read-only-path>`
5. Confirm route access fails for unauthorized company users.
6. Proceed to sync enablement only after mapping/reconciliation sign-off.

## Deployment Checklist

- `INFOR_M3_ALLOW_ENV_FALLBACK=false` is present in production.
- No shared `INFOR_M3_*` credential env vars are defined in production.
- `npm run test:infor-security` passes.
- Build security check passes.

## PR Review Checklist (Infor Changes)

Use this checklist for any PR touching `app/api/infor-m3/**` or `lib/infor-m3/**`.

- [ ] Route authorization uses `requireAuthorizedInforCompany(request, body?)` from `lib/infor-m3/route-guards.ts`.
- [ ] No route reads `companyId` directly without the shared guard helper.
- [ ] No new production path depends on env fallback credentials.
- [ ] Any new Infor endpoint includes `companyId` in responses/log context for audit traceability.
- [ ] `npm run test:infor-security` passes in CI and before deploy.

## Residual Risk to Track

- Future Infor routes could still bypass guardrails if review checklist is skipped.
