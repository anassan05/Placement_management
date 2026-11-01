# CampusConnect Phase 2B Production Readiness Checklist

Date: 2026-10-31

## Trusted proxy and edge/IP rate limiting
- Status: NOT CONFIGURED (production blocker).
- Local application uses PostgreSQL-backed email-keyed limiters only.
- Trusted proxy handling exists in `src/lib/client-ip.ts`, but no trusted proxy list or edge limiter is configured.
- Next action: configure deployment-provider edge rate limiting and set `TRUSTED_HOSTS`/proxy list for the real environment.

## HTTPS and secure cookies
- Status: NOT VERIFIED in deployed environment (production blocker).
- Code emits `Secure` cookies only when `NODE_ENV=production` and HSTS in production via `src/proxy.ts`.
- Next action: verify TLS termination, cookie attributes, and HSTS in the deployed environment.

## CSP and CORS
- Status: LOCAL CONFIGURATION PRESENT; PRODUCTION VERIFICATION PENDING.
- CSP is emitted by `src/proxy.ts`; `style-src 'unsafe-inline'` remains a documented limitation.
- Origin validation rejects unexpected cross-origin state-changing requests.
- Next action: verify headers and trusted origins in the deployed environment.

## Production secret management
- Status: NOT VERIFIED (production blocker).
- `.env` is not tracked; `.env.example` contains placeholders only.
- Next action: provide production secrets through the deployment provider secret manager; rotate any exposed development credentials.

## Production database permissions
- Status: PARTIALLY VERIFIED locally.
- Local integration tests use `campusconnect_app` with `rolsuper=false`, `rolbypassrls=false`.
- Next action: verify production runtime role grants and ownership in the production database.

## Migration and deployment hooks
- Status: NOT VERIFIED in production (production blocker).
- Local guarded procedure: `npm run db:deploy` / `scripts/deploy-safe.ps1`.
- Next action: configure and test deployment hooks against the production database.

## Private file storage controls
- Status: NOT APPLICABLE (no upload functionality exists in Phase 2B).
- Standard documented for future resume/document uploads.

## Backup and recovery procedures
- Status: NOT DOCUMENTED (production blocker).
- Next action: document encrypted backups and restoration drills.

## Deployment provider
- Status: NOT IDENTIFIED.
- Provider-specific hooks and secret management are not implemented because the deployment provider is not identified.
