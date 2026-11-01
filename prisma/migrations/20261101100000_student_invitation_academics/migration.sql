-- Phase 3B: preserve validated academic data until invitation activation.
BEGIN;
ALTER TABLE "StudentInvitation"
  ADD COLUMN "cgpa" DECIMAL(4,2),
  ADD COLUMN "tenthPercentage" DECIMAL(5,2),
  ADD COLUMN "twelfthPercentage" DECIMAL(5,2),
  ADD COLUMN "standingArrears" INTEGER,
  ADD COLUMN "historyOfArrears" BOOLEAN;
DROP INDEX "StudentInvitation_collegeId_registerNumber_key";
CREATE UNIQUE INDEX "StudentInvitation_pending_registerNumber_key" ON "StudentInvitation"("collegeId", "registerNumber")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

CREATE FUNCTION prevent_student_invitation_academic_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."acceptedAt" IS NOT NULL AND (
    NEW."cgpa" IS DISTINCT FROM OLD."cgpa"
    OR NEW."tenthPercentage" IS DISTINCT FROM OLD."tenthPercentage"
    OR NEW."twelfthPercentage" IS DISTINCT FROM OLD."twelfthPercentage"
    OR NEW."standingArrears" IS DISTINCT FROM OLD."standingArrears"
    OR NEW."historyOfArrears" IS DISTINCT FROM OLD."historyOfArrears"
  ) THEN
    RAISE EXCEPTION 'Student invitation academic data is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "StudentInvitation_academic_immutable" BEFORE UPDATE ON "StudentInvitation"
  FOR EACH ROW EXECUTE FUNCTION prevent_student_invitation_academic_change();

REVOKE INSERT ON "StudentInvitation" FROM campusconnect_app;
GRANT INSERT ("id", "collegeId", "departmentId", "fullName", "email", "emailNormalized", "registerNumber", "batchYear", "cgpa", "tenthPercentage", "twelfthPercentage", "standingArrears", "historyOfArrears", "tokenHash", "issuedByUserId", "expiresAt", "createdAt") ON "StudentInvitation" TO campusconnect_app;
COMMIT;
