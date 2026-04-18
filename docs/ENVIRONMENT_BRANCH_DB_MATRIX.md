# Environment / Branch / Database Matrix

This document defines how code branches, deployment environments, environment-variable profiles, and databases map to each other for FinancialScore.

## Matrix

| Environment | URL | Primary Branch | Env File/Profile | Database | Purpose |
|---|---|---|---|---|---|
| Dev | local (`localhost`) | `develop` (or `feature/*`) | `.env.develop` | `DB_DEV_SHARED` | Active development and testing |
| Staging | `financial-score.com` | `staging` | `.env.staging` | `DB_STAGING` | Pre-release validation/UAT |
| Prod | `dashboard.corelytics.com` | `main` | `.env.production` | `DB_PROD` | Live production for Corelytics |
| Channel Branch Deployment | `coremetriks.com` | `channel/coremetriks` | `.env.coremetriks` | `DB_COREMETRIKS` | Isolated channel UI and isolated data |

## Promotion Flow

- `feature/*` -> `develop`
- `develop` -> `staging`
- `staging` -> `main` (production)
- Channel-specific work: `feature/*` -> `channel/coremetriks` (do not merge to `main` unless intentionally shared)

## Isolation Rules

- Branches isolate code; databases isolate data.
- `dashboard.corelytics.com` and `coremetriks.com` must use separate env profiles and separate databases.
- Site admins, users, and tenant data remain isolated when database connections are separate.

## Environment Variable Guidance

Keep `.env.example` as the shared template and use deployment-specific values per environment.

At minimum, these values should be unique per deployed environment/channel:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- Channel branding keys (for example `CHANNEL_NAME`, logo/theme settings)
- Third-party integration credentials when they are environment or channel specific

## Operational Checklist (Per Environment)

- Run migrations against the target database before deploy.
- Verify login and role access (`SITEADMIN`, `CONSULTANT`, `USER`).
- Verify domain-specific branding and navigation behavior.
- Confirm background jobs/integrations target the correct environment endpoints.
- Validate backups and rollback path for the target database.

## Notes

- Changes are not pushed to all branches automatically.
- To propagate a shared change, merge or cherry-pick commits into each target branch intentionally.
