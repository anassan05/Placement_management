-- The runtime role is deliberately not a table owner or a BYPASSRLS role.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO campusconnect_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO campusconnect_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campusconnect_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO campusconnect_app;
REVOKE ALL ON TABLE "_prisma_migrations" FROM campusconnect_app;

ALTER TABLE "College" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "College" FORCE ROW LEVEL SECURITY;
CREATE POLICY college_tenant ON "College"
  USING ("id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY college_public_read ON "College"
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM "CollegeDomain" d
    WHERE d."collegeId" = "College"."id" AND d."verifiedAt" IS NOT NULL
  ));

ALTER TABLE "CollegeDomain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CollegeDomain" FORCE ROW LEVEL SECURITY;
CREATE POLICY college_domain_read ON "CollegeDomain"
  FOR SELECT USING (
    "collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR "verifiedAt" IS NOT NULL
  );
CREATE POLICY college_domain_write ON "CollegeDomain"
  FOR ALL USING ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_tenant ON "Membership"
  USING ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "MembershipDepartment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MembershipDepartment" FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_department_tenant ON "MembershipDepartment"
  USING ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "StudentProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY student_profile_tenant ON "StudentProfile"
  USING ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "AcademicRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY academic_record_tenant ON "AcademicRecord"
  USING (EXISTS (
    SELECT 1 FROM "StudentProfile" s
    WHERE s."id" = "AcademicRecord"."studentId"
      AND s."collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "StudentProfile" s
    WHERE s."id" = "AcademicRecord"."studentId"
      AND s."collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  ));

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Company" FORCE ROW LEVEL SECURITY;
CREATE POLICY company_tenant ON "Company"
  USING ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "PlacementDrive" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlacementDrive" FORCE ROW LEVEL SECURITY;
CREATE POLICY placement_drive_tenant ON "PlacementDrive"
  USING ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "DriveRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DriveRule" FORCE ROW LEVEL SECURITY;
CREATE POLICY drive_rule_tenant ON "DriveRule"
  USING (EXISTS (
    SELECT 1 FROM "PlacementDrive" d
    WHERE d."id" = "DriveRule"."driveId"
      AND d."collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "PlacementDrive" d
    WHERE d."id" = "DriveRule"."driveId"
      AND d."collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
  ));

ALTER TABLE "Registration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Registration" FORCE ROW LEVEL SECURITY;
CREATE POLICY registration_tenant ON "Registration"
  USING ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_log_tenant ON "AuditLog"
  USING ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
