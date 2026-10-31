-- Phase 2B: tenant-safe departments and standalone staff invitations.
BEGIN;
-- The backfill reads a FORCE-RLS join table. A migration role without BYPASSRLS must fail rather than silently lose legacy assignments.
SET LOCAL row_security = off;
CREATE TABLE "Department" (
  "id" UUID NOT NULL,
  "collegeId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "shortCode" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Department_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Department_collegeId_name_key" ON "Department"("collegeId", "name");
CREATE UNIQUE INDEX "Department_collegeId_shortCode_key" ON "Department"("collegeId", "shortCode");
CREATE UNIQUE INDEX "Department_id_collegeId_key" ON "Department"("id", "collegeId");
CREATE INDEX "Department_collegeId_isActive_idx" ON "Department"("collegeId", "isActive");

-- Preserve historic department assignments by materializing the codes already in use.
INSERT INTO "Department" ("id", "collegeId", "name", "shortCode", "createdAt", "updatedAt")
SELECT gen_random_uuid(), codes."collegeId", upper(codes.code), upper(codes.code), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT "collegeId", "departmentCode" AS code FROM "MembershipDepartment"
  UNION
  SELECT "collegeId", "departmentCode" AS code FROM "StudentProfile"
) AS codes
GROUP BY codes."collegeId", upper(codes.code);

ALTER TABLE "MembershipDepartment" ADD COLUMN "departmentId" UUID;
UPDATE "MembershipDepartment" md SET "departmentId" = d."id"
FROM "Department" d WHERE d."collegeId" = md."collegeId" AND d."shortCode" = upper(md."departmentCode");
ALTER TABLE "MembershipDepartment" ALTER COLUMN "departmentId" SET NOT NULL;
DROP INDEX "MembershipDepartment_collegeId_departmentCode_idx";
ALTER TABLE "MembershipDepartment" DROP CONSTRAINT "MembershipDepartment_pkey";
ALTER TABLE "MembershipDepartment" DROP COLUMN "departmentCode";
ALTER TABLE "MembershipDepartment" ADD CONSTRAINT "MembershipDepartment_pkey" PRIMARY KEY ("membershipId", "departmentId");
CREATE INDEX "MembershipDepartment_collegeId_departmentId_idx" ON "MembershipDepartment"("collegeId", "departmentId");
ALTER TABLE "MembershipDepartment" ADD CONSTRAINT "MembershipDepartment_departmentId_collegeId_fkey"
  FOREIGN KEY ("departmentId", "collegeId") REFERENCES "Department"("id", "collegeId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StaffInvitation" (
  "id" UUID NOT NULL,
  "collegeId" UUID NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "role" "MembershipRole" NOT NULL,
  "message" TEXT,
  "tokenHash" TEXT NOT NULL,
  "issuedByUserId" UUID NOT NULL,
  "acceptedByUserId" UUID,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffInvitation_role_check" CHECK ("role" IN ('PLACEMENT_OFFICER', 'COORDINATOR')),
  CONSTRAINT "StaffInvitation_lifecycle_check" CHECK (NOT ("acceptedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)),
  CONSTRAINT "StaffInvitation_acceptor_check" CHECK (("acceptedAt" IS NULL) = ("acceptedByUserId" IS NULL)),
  CONSTRAINT "StaffInvitation_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StaffInvitation_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StaffInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StaffInvitation_tokenHash_key" ON "StaffInvitation"("tokenHash");
CREATE UNIQUE INDEX "StaffInvitation_id_collegeId_key" ON "StaffInvitation"("id", "collegeId");
CREATE UNIQUE INDEX "StaffInvitation_one_pending_email_key" ON "StaffInvitation"("collegeId", "emailNormalized")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
CREATE INDEX "StaffInvitation_collegeId_createdAt_idx" ON "StaffInvitation"("collegeId", "createdAt");
CREATE INDEX "StaffInvitation_emailNormalized_expiresAt_idx" ON "StaffInvitation"("emailNormalized", "expiresAt");

CREATE FUNCTION prevent_staff_invitation_identity_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."collegeId" IS DISTINCT FROM OLD."collegeId"
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW."emailNormalized" IS DISTINCT FROM OLD."emailNormalized"
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW."tokenHash" IS DISTINCT FROM OLD."tokenHash"
    OR NEW."issuedByUserId" IS DISTINCT FROM OLD."issuedByUserId"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."fullName" IS DISTINCT FROM OLD."fullName"
    OR NEW.message IS DISTINCT FROM OLD.message THEN
    RAISE EXCEPTION 'Staff invitation identity and role are immutable';
  END IF;
  IF OLD."acceptedAt" IS NOT NULL AND (NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt" OR NEW."acceptedByUserId" IS DISTINCT FROM OLD."acceptedByUserId") THEN
    RAISE EXCEPTION 'Staff invitation acceptance is immutable';
  END IF;
  IF OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt" THEN
    RAISE EXCEPTION 'Staff invitation revocation is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "StaffInvitation_identity_immutable" BEFORE UPDATE ON "StaffInvitation"
  FOR EACH ROW EXECUTE FUNCTION prevent_staff_invitation_identity_change();

CREATE TABLE "StaffInvitationDepartment" (
  "invitationId" UUID NOT NULL,
  "departmentId" UUID NOT NULL,
  "collegeId" UUID NOT NULL,
  CONSTRAINT "StaffInvitationDepartment_pkey" PRIMARY KEY ("invitationId", "departmentId"),
  CONSTRAINT "StaffInvitationDepartment_invitationId_collegeId_fkey" FOREIGN KEY ("invitationId", "collegeId") REFERENCES "StaffInvitation"("id", "collegeId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffInvitationDepartment_departmentId_collegeId_fkey" FOREIGN KEY ("departmentId", "collegeId") REFERENCES "Department"("id", "collegeId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "StaffInvitationDepartment_collegeId_departmentId_idx" ON "StaffInvitationDepartment"("collegeId", "departmentId");

ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Department" FORCE ROW LEVEL SECURITY;
CREATE POLICY department_tenant ON "Department" USING ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS membership_department_tenant ON "MembershipDepartment";
CREATE POLICY membership_department_tenant ON "MembershipDepartment" USING ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "StaffInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffInvitation" FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_invitation_read ON "StaffInvitation" FOR SELECT USING (
  "collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  OR "tokenHash" = NULLIF(current_setting('app.staff_invitation_token_hash', true), '')
);
CREATE POLICY staff_invitation_insert ON "StaffInvitation" FOR INSERT WITH CHECK (
  "collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  AND "role" IN ('PLACEMENT_OFFICER', 'COORDINATOR')
  AND "issuedByUserId" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
);
CREATE POLICY staff_invitation_update ON "StaffInvitation" FOR UPDATE
  USING ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR ("tokenHash" = NULLIF(current_setting('app.staff_invitation_token_hash', true), '') AND "acceptedAt" IS NULL AND "revokedAt" IS NULL))
  WITH CHECK ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    AND "role" IN ('PLACEMENT_OFFICER', 'COORDINATOR')
    AND ("acceptedAt" IS NULL OR "acceptedByUserId" = NULLIF(current_setting('app.current_user_id', true), '')::uuid));

ALTER TABLE "StaffInvitationDepartment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffInvitationDepartment" FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_invitation_department_tenant ON "StaffInvitationDepartment" USING (
  "collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

REVOKE ALL ON "Department", "StaffInvitation", "StaffInvitationDepartment", "MembershipDepartment" FROM campusconnect_app;
GRANT SELECT ON "Department" TO campusconnect_app;
GRANT INSERT ("id", "collegeId", "name", "shortCode", "description", "isActive", "createdAt", "updatedAt") ON "Department" TO campusconnect_app;
GRANT UPDATE ("name", "shortCode", "description", "isActive", "updatedAt") ON "Department" TO campusconnect_app;
GRANT SELECT ("id", "collegeId", "fullName", "email", "emailNormalized", "role", "message", "tokenHash", "issuedByUserId", "acceptedByUserId", "expiresAt", "acceptedAt", "revokedAt", "createdAt") ON "StaffInvitation" TO campusconnect_app;
GRANT INSERT ("id", "collegeId", "fullName", "email", "emailNormalized", "role", "message", "tokenHash", "issuedByUserId", "expiresAt", "createdAt") ON "StaffInvitation" TO campusconnect_app;
GRANT UPDATE ("acceptedAt", "acceptedByUserId", "revokedAt") ON "StaffInvitation" TO campusconnect_app;
GRANT SELECT, INSERT ON "StaffInvitationDepartment" TO campusconnect_app;
GRANT SELECT, INSERT, DELETE ON "MembershipDepartment" TO campusconnect_app;
COMMIT;
