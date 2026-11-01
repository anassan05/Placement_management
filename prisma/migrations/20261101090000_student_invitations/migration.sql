-- Phase 3A: tenant-scoped student invitations and atomic activation.
BEGIN;
CREATE TABLE "StudentInvitation" (
  "id" UUID NOT NULL,
  "collegeId" UUID NOT NULL,
  "departmentId" UUID NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "registerNumber" TEXT NOT NULL,
  "batchYear" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "issuedByUserId" UUID NOT NULL,
  "acceptedByUserId" UUID,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentInvitation_lifecycle_check" CHECK (NOT ("acceptedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)),
  CONSTRAINT "StudentInvitation_acceptor_check" CHECK (("acceptedAt" IS NULL) = ("acceptedByUserId" IS NULL)),
  CONSTRAINT "StudentInvitation_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentInvitation_departmentId_collegeId_fkey" FOREIGN KEY ("departmentId", "collegeId") REFERENCES "Department"("id", "collegeId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentInvitation_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StudentInvitation_tokenHash_key" ON "StudentInvitation"("tokenHash");
CREATE UNIQUE INDEX "StudentInvitation_id_collegeId_key" ON "StudentInvitation"("id", "collegeId");
CREATE UNIQUE INDEX "StudentInvitation_collegeId_registerNumber_key" ON "StudentInvitation"("collegeId", "registerNumber");
CREATE UNIQUE INDEX "StudentInvitation_one_pending_email_key" ON "StudentInvitation"("collegeId", "emailNormalized")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
CREATE INDEX "StudentInvitation_collegeId_createdAt_idx" ON "StudentInvitation"("collegeId", "createdAt");
CREATE INDEX "StudentInvitation_emailNormalized_expiresAt_idx" ON "StudentInvitation"("emailNormalized", "expiresAt");

CREATE FUNCTION prevent_student_invitation_identity_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."collegeId" IS DISTINCT FROM OLD."collegeId"
    OR NEW."departmentId" IS DISTINCT FROM OLD."departmentId"
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW."emailNormalized" IS DISTINCT FROM OLD."emailNormalized"
    OR NEW."registerNumber" IS DISTINCT FROM OLD."registerNumber"
    OR NEW."batchYear" IS DISTINCT FROM OLD."batchYear"
    OR NEW."tokenHash" IS DISTINCT FROM OLD."tokenHash"
    OR NEW."issuedByUserId" IS DISTINCT FROM OLD."issuedByUserId"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."fullName" IS DISTINCT FROM OLD."fullName" THEN
    RAISE EXCEPTION 'Student invitation identity is immutable';
  END IF;
  IF OLD."acceptedAt" IS NOT NULL AND (NEW."acceptedAt" IS DISTINCT FROM OLD."acceptedAt" OR NEW."acceptedByUserId" IS DISTINCT FROM OLD."acceptedByUserId") THEN
    RAISE EXCEPTION 'Student invitation acceptance is immutable';
  END IF;
  IF OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt" THEN
    RAISE EXCEPTION 'Student invitation revocation is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "StudentInvitation_identity_immutable" BEFORE UPDATE ON "StudentInvitation"
  FOR EACH ROW EXECUTE FUNCTION prevent_student_invitation_identity_change();

ALTER TABLE "StudentInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentInvitation" FORCE ROW LEVEL SECURITY;
CREATE POLICY student_invitation_read ON "StudentInvitation" FOR SELECT USING (
  "collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  OR "tokenHash" = NULLIF(current_setting('app.student_invitation_token_hash', true), '')
);
CREATE POLICY student_invitation_insert ON "StudentInvitation" FOR INSERT WITH CHECK (
  "collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  AND "issuedByUserId" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
);
CREATE POLICY student_invitation_update ON "StudentInvitation" FOR UPDATE
  USING ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR ("tokenHash" = NULLIF(current_setting('app.student_invitation_token_hash', true), '') AND "acceptedAt" IS NULL AND "revokedAt" IS NULL))
  WITH CHECK ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    AND ("acceptedAt" IS NULL OR "acceptedByUserId" = NULLIF(current_setting('app.current_user_id', true), '')::uuid));

REVOKE ALL ON "StudentInvitation" FROM campusconnect_app;
GRANT SELECT ON "StudentInvitation" TO campusconnect_app;
GRANT INSERT ("id", "collegeId", "departmentId", "fullName", "email", "emailNormalized", "registerNumber", "batchYear", "tokenHash", "issuedByUserId", "expiresAt", "createdAt") ON "StudentInvitation" TO campusconnect_app;
GRANT UPDATE ("acceptedAt", "acceptedByUserId", "revokedAt") ON "StudentInvitation" TO campusconnect_app;
COMMIT;
