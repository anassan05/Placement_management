# Security status before real student data

## Implemented in the foundation

- [x] Zod environment validation for required PostgreSQL URL and app configuration.
- [x] PostgreSQL runtime uses a separate, non-owner database role in Docker Compose.
- [x] Forced PostgreSQL RLS policies use transaction-local tenant context.
- [x] Composite foreign keys prevent cross-college student/membership, company/drive, and registration links.
- [x] Central permission map distinguishes platform admin principals from college membership roles.
- [x] Coordinator department assignment is represented in the schema and checked centrally.
- [x] Password hashing primitive uses salted scrypt; session tokens are random and stored as hashes.
- [x] Cookie options are HttpOnly, SameSite=Lax, and Secure in production.
- [x] Generic errors avoid returning internal exception details.

## Required before a pilot

- [ ] Complete recovery, email delivery/ownership verification, session rotation, and a deployment-specific CSRF/origin review. Platform and College Admin login plus invitation-based onboarding are implemented; Next.js Server Actions enforce origin checks.
- [ ] Add route/service authorization and active membership checks to every future protected operation.
- [x] Run the real PostgreSQL integration suite with an app role that is not owner/superuser/BYPASSRLS; cross-tenant CRUD and transaction-context tests pass.
- [x] Global User and Session tables use forced RLS. Session rows are scoped to the presented opaque token hash; User reads are limited by auth email/current user/session context. Password hash access is column-scoped for authentication verification and never returned to the browser.
- [x] Tenant and auth GUC values are transaction-local. They are not secrets or unforgeable capabilities. Arbitrary SQL execution under `campusconnect_app` can set custom GUC values and may bypass these RLS predicates; RLS does not protect against arbitrary SQL compromise.
- [ ] Add trusted edge/IP rate limits and abuse monitoring. PostgreSQL-backed login/application limits currently key by email and can be evaded by distributed submissions using many addresses.
- [ ] Add private upload storage, file signature validation, size limits, and short-lived signed URLs.
- [ ] Extend audit coverage and retention controls for future sensitive reads, edits, and exports. Platform onboarding decisions and initial tenant activation are audited.
- [ ] Add encrypted backups and restoration drills.
- [ ] Define consent, retention, deletion, incident response, and privacy review with qualified counsel.
- [ ] Review cookie domain, proxy/Host handling, TLS, secrets, database network rules, and operational logging for the deployment environment.
