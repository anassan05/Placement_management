# Database design

`prisma/schema.prisma` defines the data model. `prisma/migrations` contains the initial schema and PostgreSQL RLS policies.

## Entities

College and verified domains; global User and Session (with persisted active college); college-scoped Membership and MembershipDepartment; StudentProfile and AcademicRecord; Company, PlacementDrive, DriveRule, Registration, and AuditLog.

## Constraints and indexes

- User email, college slug/code, and CollegeDomain hostname are globally unique.
- Membership is unique by `(collegeId, userId)`; StudentProfile is unique by `(collegeId, registerNumber)` and one-to-one with membership.
- A composite `(membershipId, collegeId)` foreign key prevents a student profile from using another college's membership.
- Company exposes `(id, collegeId)` as a composite key; PlacementDrive references that pair.
- StudentProfile and PlacementDrive expose `(id, collegeId)`; Registration references both pairs and is unique by `(driveId, studentId)`.
- CGPA and academic percentages use Decimal. JSON is limited to variable rule values and registration snapshots.
- Indexes support tenant status/deadline, department, student verification, registration, and audit queries.

## Row-level security

The RLS migration enables and forces policies for College, CollegeDomain, Membership, MembershipDepartment, StudentProfile, AcademicRecord, Company, PlacementDrive, DriveRule, Registration, and AuditLog. AcademicRecord and DriveRule policies scope through their parent row. Public reads are limited to verified domains and their college's public metadata.

`app.current_tenant_id` must be set with transaction-local `set_config(..., true)`. The runtime database login must not own tables and must not be superuser or `BYPASSRLS`; otherwise PostgreSQL can bypass policies. Use `APP_DATABASE_URL` for runtime and the owner `DATABASE_URL` for Prisma migrations. The Docker Compose initialization SQL creates the local-only runtime role on a fresh volume.

Users and sessions are global identity tables and are explicit RLS exceptions. The runtime role currently has global table access to those two tables; keep that access inside authentication services. It can read user/session rows across colleges, so do not expose generic queries or user lists through routes. `_prisma_migrations` is revoked from the runtime role.

## Pending before a pilot

Proof reviews and private storage metadata, consent receipts, extraction jobs/corrections, notification outbox, retention/deletion workflows, verified academic-history records, and immutable audit write paths remain future work. DriveRule JSON requires a versioned validated rule contract before publication.
