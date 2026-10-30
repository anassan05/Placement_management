# CampusConnect architecture

## Style and request flow

CampusConnect is a modular monolith. Next.js App Router provides the UI and API boundary; domain rules live in `src/modules`; Prisma 7 and PostgreSQL own persistence and database constraints.

Authenticated request flow: verified opaque session token → user and active membership lookup → permission check → transaction-local tenant context → tenant-scoped service → PostgreSQL RLS and constraints. Request body or URL `collegeId` values are never tenant authority.

## Tenant resolution

- Before login, `resolvePublicCollege` normalizes the Host header and accepts only verified CollegeDomain rows for active colleges. The verified public lookup is the one RLS exception; domain mutation remains tenant-scoped.
- After login, `Session.activeCollegeId` stores the selected college. `resolveMembershipPrincipal` accepts only the opaque session token, loads the user and active college from the persisted session, and checks the persisted membership, user, and college status.
- `withTenantTransaction` accepts only an active membership principal and calls PostgreSQL `set_config('app.current_tenant_id', ..., true)` inside the same transaction as tenant data work.
- Tenant tables use forced RLS. The runtime role must be a non-owner, non-superuser, `NOBYPASSRLS` role. `DATABASE_URL` is the migration/owner connection; `APP_DATABASE_URL` is the application connection.
- PostgreSQL foreign keys also enforce tenant equality for student/membership, company/drive, and student/drive registration relationships.

RLS is defense in depth. Each protected service still needs a permission check and a scoped transaction. Do not treat hostname matching as authorization.

## Identity and authorization

`PLATFORM_SUPER_ADMIN` is represented as a separate platform principal and is not a MembershipRole. College roles are constrained to active memberships. Coordinator department assignments are persisted in MembershipDepartment. Permission checks are centralized in `modules/authorization/permissions.ts`.

The repository includes scrypt password hashes, opaque random session tokens stored as SHA-256 hashes, expiry and revocation checks, verified active-college selection, and HttpOnly cookie options. Login, account recovery, token rotation, and CSRF controls are not yet implemented.

## Modules

- `tenancy`: verified public domain lookup, active membership resolution, transaction-local tenant context
- `authentication`: password/session primitives; full login flow pending
- `authorization`: role permissions and department checks
- `colleges`, `students`, `companies`, `drives`, `registrations`: schema foundations; business services pending
- `audit`: tenant-scoped event writer; emits only action and entity references, without free-form metadata
- `extraction`, `notifications`, `reporting`: reserved module boundaries

## Operational boundary

Do not use real student data until the database integration suite and browser suite pass in an environment with the required PostgreSQL roles and Playwright browser installed. Storage policy for private uploads, backups, privacy/retention process, rate limiting, and security review are pending. This is a foundation, not a production-ready deployment.
