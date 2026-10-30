# Testing

## Local checks

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

Vitest covers permissions, environment validation, request validation, onboarding validation, password/session primitives, hostname normalization, and the health endpoint. Playwright covers landing/navigation, responsive layout, onboarding forms, the health endpoint, error presentation, and the synthetic application-to-approval-to-invitation-acceptance journey.

## PostgreSQL integration tests

`src/modules/tenancy/database.integration.test.ts` and `src/modules/onboarding/onboarding.integration.test.ts` use the real `pg` driver, PostgreSQL, and Prisma runtime helpers. They verify forced RLS/grants, cross-college reads and CRUD, unset/sequential/concurrent tenant contexts, foreign keys, session expiry/revocation, application rate limits, approval/rejection, concurrent approval and invitation acceptance, invitation expiry/revocation/replay, password hashing, and College Admin login. They require a migrated test database plus:

- `TEST_ADMIN_DATABASE_URL`: test database owner connection, used to create and clean fixtures.
- `TEST_DATABASE_URL`: non-owner runtime login with forced RLS enabled.

Without both variables these integration suites are skipped. A skipped suite is not evidence that database isolation passed. Use `npm run db:test:status`, `npm run db:test:deploy`, and `npm run test:integration`; the helper derives test URLs if needed and rejects any target other than `campusconnect_test`. Browser setup also uses this isolated database and removes synthetic fixtures. No migration reset is used. See [Setup](SETUP.md) and [Phase 2A onboarding](PHASE-2A-ONBOARDING.md).

## Recent acceptance run

The Windows Node.js installation reports v22.23.4. PostgreSQL 16 development and isolated test databases are up to date. The real database suites and Chromium E2E journey have been run; use the exact command output from the current run when reporting counts.
