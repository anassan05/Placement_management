# Phase 2B security boundaries

## Tenant data access

Department, MembershipDepartment, StaffInvitation, and StaffInvitationDepartment are tenant-scoped with PostgreSQL RLS enabled and forced. The new department and invitation assignment foreign keys include `collegeId`, so relationships cannot cross colleges. Runtime privileges are explicitly narrowed in migration `20261031100000_staff_departments`: department rows cannot be deleted by the application, invitation identity/role fields cannot be updated, and assignment tables expose only required operations.

The migration backfills departments from existing `MembershipDepartment` and `StudentProfile` codes. Since both source tables use FORCE RLS, the migration connection must have `BYPASSRLS` (or be a superuser); `row_security=off` makes an insufficient migration role fail instead of silently omitting existing rows. The migration is wrapped in a transaction so a failed backfill does not leave partial DDL behind.

Staff operations accept a Principal resolved from the persisted session and active membership. Every tenant query and mutation runs through `withTenantTransaction`, which revalidates that persisted membership, sets transaction-local tenant and user settings, and passes only the transaction client to the service. Staff invitations use random 256-bit bearer tokens; only SHA-256 token hashes are stored. The raw link is returned to the issuer once; manual delivery is supported, but email delivery and email ownership verification are not implemented.

## RLS limitation

The application relies on a restricted, non-owner runtime role, parameterized Prisma queries, and controlled service boundaries. PostgreSQL custom settings such as `app.current_tenant_id` are not unforgeable credentials. Anyone able to execute arbitrary SQL as `campusconnect_app` may be able to change a custom tenant setting and defeat tenant RLS predicates. RLS is therefore a defense against query mistakes and unauthorized application paths, not against arbitrary SQL execution or a full compromise of the application role. Do not expose SQL consoles or arbitrary-query features through the runtime connection.

## Historical roles

The `HOD` enum value is retained for migration/data compatibility. This phase adds no HOD invitation, UI, workspace, or permissions; the authorization map grants no permissions to that historical value. No HOD schema/data removal is attempted.
