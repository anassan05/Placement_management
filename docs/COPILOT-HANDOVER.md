# CampusConnect Copilot Handover

## Repository state

- Repository: `anassan05/Placement_management`
- Branch: `main`
- HEAD: `fe0d5f1` (`small`)
- The worktree contains uncommitted Phase 2B security/staff changes and Phase 3 student-management changes. These are preserved and must not be reverted.
- `CLAUDE.md` is not present in the repository.

## Architecture

CampusConnect is a modular monolith using Next.js 16 App Router, React 19, TypeScript strict mode, Tailwind CSS, PostgreSQL 16, Prisma 7, Zod, Vitest, Playwright, and Docker. Tenant-aware server services resolve an active membership from an HttpOnly session, set transaction-local PostgreSQL tenant/user GUCs, and perform all tenant work inside a transaction. The application database role is intentionally non-owner, non-superuser, and `NOBYPASSRLS`.

Roles are `PLATFORM_SUPER_ADMIN` at the platform-user level and `COLLEGE_ADMIN`, `PLACEMENT_OFFICER`, `COORDINATOR`, and `STUDENT` at the membership level. The Prisma enum retains `HOD` as historical schema compatibility, but authorization does not grant it and no HOD feature exists.

## Database and migrations

`prisma/schema.prisma` contains colleges/domains, users/sessions, memberships and departments, student profiles/academic records, placement entities, audit logs, onboarding invitations, and rate-limit buckets. Migrations are ordered from the initial schema through forced RLS, session/auth grants, college onboarding, invitation activation reads, staff departments, and `20261101090000_student_invitations`. Runtime migrations use the owner `DATABASE_URL`; application queries use `APP_DATABASE_URL`.

Tenant tables use forced RLS with tenant-scoped `USING`/`WITH CHECK` policies. Global identity tables have narrowly scoped authentication/session policies. `StudentInvitation` has token-bound read/update policies, immutable enrollment identity, and runtime grants limited to issuance and acceptance fields.

## Existing security controls

- Hashed random session and invitation tokens; raw tokens are not stored or logged.
- Scrypt password hashing with per-password salts.
- Server-side Zod validation, strict object schemas, generic authentication failures, and PostgreSQL-backed rate limiting.
- Transaction-local tenant/user context and forced RLS; coordinator access is restricted to assigned department codes.
- Origin checks and security headers in `src/proxy.ts`; HttpOnly, SameSite cookies.
- Tenant audit events for existing college/staff mutations.

Production remains blocked by privileged-account TOTP MFA, trusted edge/IP rate limiting, deployed HTTPS/cookie/header/CORS verification, production secret management, deployment/database migration hooks, and backup/recovery verification. These controls are not claimed as resolved.

## Student management

Implemented in the current worktree:

- Tenant-scoped student listing/detail services.
- Student profile and academic validation/update services.
- Coordinator department restrictions on reads and updates.
- `/college/students` and `/college/students/[id]` pages.

Implemented: secure student invitations/activation with hashed single-use expiring tokens, duplicate prevention, atomic membership/profile creation, tenant/coordinator authorization, audit events, activation UI, bulk CSV import with transactional invitation creation, and Phase 3C private document metadata/storage, validation, authorized downloads, and audit events. The student dashboard remains unimplemented.

Phase 3C uses `StudentDocument` and migration `20261101110000_student_documents`. Development storage is a private filesystem root configured by `PRIVATE_STORAGE_ROOT`; files are never placed under `public/` and are addressed only by random UUID keys. Uploads are limited by `STUDENT_DOCUMENT_MAX_BYTES` and accept PDF/PNG/JPEG signatures only. Malware scanning is not configured, so signature validation does not establish that a file is malware-free. Staff access follows student permissions and coordinator department assignments; students can access only their own profile documents.

## Verification baseline

The Phase 3B local run passed typecheck, lint, production build, 32 unit tests (18 integration tests skipped in the normal unit command), and 50 tests in the real PostgreSQL integration command. Phase 3C typecheck, lint, and production build pass; its PostgreSQL integration and Playwright suites have not yet been rerun.

## Documentation differences

- `CLAUDE.md` is absent.
- The README previously described student management as unimplemented; it now reflects the implemented student profile and 3A scope.
- `docs/IMPLEMENTATION-STATUS.md` was updated to record this takeover, 3A completion, and current verification.
- Phase 2B security and production-readiness documents correctly retain the production blockers; their historical test counts differ from the current 27-pass/13-skipped unit run.

## Exact next task

Complete Phase 3C database and Playwright verification, then address any findings. Do not begin dashboard work until those tests pass.
