CREATE TYPE "CollegeApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "CollegeOnboardingState" AS ENUM ('NOT_STARTED', 'INVITATION_PENDING', 'ADMIN_ACTIVATED');

ALTER TABLE "College"
  ADD COLUMN "normalizedName" TEXT,
  ADD COLUMN "shortName" TEXT,
  ADD COLUMN "websiteUrl" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "onboardingState" "CollegeOnboardingState" NOT NULL DEFAULT 'ADMIN_ACTIVATED';

UPDATE "College"
SET "normalizedName" = lower(regexp_replace(btrim("name"), '\s+', ' ', 'g'));
CREATE UNIQUE INDEX "College_normalizedName_key" ON "College"("normalizedName");

CREATE TABLE "CollegeApplication" (
  "id" UUID NOT NULL,
  "applicationRef" TEXT NOT NULL,
  "collegeName" TEXT NOT NULL,
  "shortName" TEXT NOT NULL,
  "websiteUrl" TEXT,
  "contactEmail" TEXT NOT NULL,
  "contactEmailNormalized" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "district" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "administratorName" TEXT NOT NULL,
  "administratorEmail" TEXT NOT NULL,
  "administratorEmailNormalized" TEXT NOT NULL,
  "message" TEXT,
  "submissionKey" TEXT,
  "status" "CollegeApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "onboardingState" "CollegeOnboardingState",
  "rejectionReason" TEXT,
  "reviewedByUserId" UUID,
  "reviewedAt" TIMESTAMP(3),
  "collegeId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollegeApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CollegeApplication_lifecycle_check" CHECK (
    ("status" = 'PENDING' AND "reviewedByUserId" IS NULL AND "reviewedAt" IS NULL AND "collegeId" IS NULL AND "onboardingState" IS NULL)
    OR ("status" = 'APPROVED' AND "reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "collegeId" IS NOT NULL AND "onboardingState" IN ('INVITATION_PENDING', 'ADMIN_ACTIVATED'))
    OR ("status" = 'REJECTED' AND "reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "collegeId" IS NULL AND "onboardingState" IS NULL)
    OR ("status" = 'WITHDRAWN' AND "collegeId" IS NULL AND "onboardingState" IS NULL)
  )
);

CREATE TABLE "CollegeAdminInvitation" (
  "id" UUID NOT NULL,
  "applicationId" UUID NOT NULL,
  "collegeId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "role" "MembershipRole" NOT NULL DEFAULT 'COLLEGE_ADMIN',
  "issuedByUserId" UUID NOT NULL,
  "acceptedByUserId" UUID,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollegeAdminInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CollegeAdminInvitation_role_check" CHECK ("role" = 'COLLEGE_ADMIN'),
  CONSTRAINT "CollegeAdminInvitation_lifecycle_check" CHECK (NOT ("acceptedAt" IS NOT NULL AND "revokedAt" IS NOT NULL))
);

CREATE TABLE "PlatformAuditLog" (
  "id" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateLimitBucket" (
  "keyHash" VARCHAR(64) NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("keyHash"),
  CONSTRAINT "RateLimitBucket_attempts_check" CHECK ("attempts" > 0)
);

CREATE UNIQUE INDEX "CollegeApplication_applicationRef_key" ON "CollegeApplication"("applicationRef");
CREATE UNIQUE INDEX "CollegeApplication_submissionKey_key" ON "CollegeApplication"("submissionKey");
CREATE UNIQUE INDEX "CollegeApplication_collegeId_key" ON "CollegeApplication"("collegeId");
CREATE INDEX "CollegeApplication_status_createdAt_idx" ON "CollegeApplication"("status", "createdAt");
CREATE INDEX "CollegeApplication_onboardingState_createdAt_idx" ON "CollegeApplication"("onboardingState", "createdAt");
CREATE INDEX "CollegeApplication_contactEmailNormalized_idx" ON "CollegeApplication"("contactEmailNormalized");

CREATE UNIQUE INDEX "CollegeAdminInvitation_applicationId_key" ON "CollegeAdminInvitation"("applicationId");
CREATE UNIQUE INDEX "CollegeAdminInvitation_tokenHash_key" ON "CollegeAdminInvitation"("tokenHash");
CREATE INDEX "CollegeAdminInvitation_collegeId_createdAt_idx" ON "CollegeAdminInvitation"("collegeId", "createdAt");
CREATE INDEX "CollegeAdminInvitation_emailNormalized_expiresAt_idx" ON "CollegeAdminInvitation"("emailNormalized", "expiresAt");
CREATE INDEX "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");
CREATE INDEX "PlatformAuditLog_entityType_entityId_createdAt_idx" ON "PlatformAuditLog"("entityType", "entityId", "createdAt");

ALTER TABLE "CollegeApplication" ADD CONSTRAINT "CollegeApplication_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CollegeApplication" ADD CONSTRAINT "CollegeApplication_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CollegeAdminInvitation" ADD CONSTRAINT "CollegeAdminInvitation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CollegeApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CollegeAdminInvitation" ADD CONSTRAINT "CollegeAdminInvitation_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CollegeAdminInvitation" ADD CONSTRAINT "CollegeAdminInvitation_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CollegeAdminInvitation" ADD CONSTRAINT "CollegeAdminInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformAuditLog" ADD CONSTRAINT "PlatformAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Global User lookups are restricted by a transaction-local authenticated-email/user/session context.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY user_auth_context_read ON "User" FOR SELECT USING (
  "email" = NULLIF(current_setting('app.auth_email', true), '')
  OR "id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  OR EXISTS (
    SELECT 1 FROM "Session" s
    WHERE s."userId" = "User"."id"
      AND s."tokenHash" = NULLIF(current_setting('app.current_session_hash', true), '')
  )
);
CREATE POLICY user_invited_account_create ON "User" FOR INSERT WITH CHECK (
  "email" = NULLIF(current_setting('app.auth_email', true), '') AND "isPlatformAdmin" = false
);
GRANT SELECT ("email", "passwordHash", "displayName", "isPlatformAdmin") ON "User" TO campusconnect_app;
GRANT INSERT ("id", "email", "passwordHash", "displayName", "isPlatformAdmin", "createdAt", "updatedAt") ON "User" TO campusconnect_app;

-- Allow verified users to select only their own memberships before choosing the active college.
CREATE POLICY membership_self_select ON "Membership" FOR SELECT USING (
  "userId" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
);
CREATE POLICY membership_platform_select ON "Membership" FOR SELECT USING (
  current_setting('app.is_platform_admin', true) = 'true'
);
CREATE POLICY college_platform_select ON "College" FOR SELECT USING (
  current_setting('app.is_platform_admin', true) = 'true'
);
CREATE POLICY college_platform_update ON "College" FOR UPDATE
  USING (current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (current_setting('app.is_platform_admin', true) = 'true');

ALTER TABLE "CollegeApplication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CollegeApplication" FORCE ROW LEVEL SECURITY;
CREATE POLICY college_application_public_insert ON "CollegeApplication" FOR INSERT WITH CHECK (
  "status" = 'PENDING' AND "onboardingState" IS NULL AND "reviewedByUserId" IS NULL
  AND "reviewedAt" IS NULL AND "collegeId" IS NULL AND "rejectionReason" IS NULL AND "submissionKey" IS NOT NULL
);
CREATE POLICY college_application_platform_admin ON "CollegeApplication" FOR ALL
  USING (current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY college_application_invitation_activation ON "CollegeApplication" FOR UPDATE
  USING (
    "id" = NULLIF(current_setting('app.invitation_application_id', true), '')::uuid
    AND "status" = 'APPROVED' AND "onboardingState" = 'INVITATION_PENDING'
  )
  WITH CHECK (
    "id" = NULLIF(current_setting('app.invitation_application_id', true), '')::uuid
    AND "status" = 'APPROVED' AND "onboardingState" = 'ADMIN_ACTIVATED'
  );

ALTER TABLE "CollegeAdminInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CollegeAdminInvitation" FORCE ROW LEVEL SECURITY;
CREATE POLICY college_invitation_platform_admin ON "CollegeAdminInvitation" FOR ALL
  USING (current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (current_setting('app.is_platform_admin', true) = 'true');
CREATE POLICY college_invitation_token_read ON "CollegeAdminInvitation" FOR SELECT USING (
  "tokenHash" = NULLIF(current_setting('app.invitation_token_hash', true), '')
);
CREATE POLICY college_invitation_token_accept ON "CollegeAdminInvitation" FOR UPDATE
  USING (
    "tokenHash" = NULLIF(current_setting('app.invitation_token_hash', true), '')
    AND "acceptedAt" IS NULL AND "revokedAt" IS NULL
  )
  WITH CHECK (
    "tokenHash" = NULLIF(current_setting('app.invitation_token_hash', true), '')
    AND "acceptedAt" IS NOT NULL AND "revokedAt" IS NULL AND "role" = 'COLLEGE_ADMIN'
  );

ALTER TABLE "PlatformAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformAuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_audit_admin_access ON "PlatformAuditLog" FOR ALL
  USING (current_setting('app.is_platform_admin', true) = 'true')
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    AND "actorUserId" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

ALTER TABLE "RateLimitBucket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimitBucket" FORCE ROW LEVEL SECURITY;
CREATE POLICY rate_limit_key_scope ON "RateLimitBucket" FOR ALL
  USING ("keyHash" = NULLIF(current_setting('app.current_rate_limit_hash', true), ''))
  WITH CHECK ("keyHash" = NULLIF(current_setting('app.current_rate_limit_hash', true), ''));
CREATE POLICY rate_limit_stale_cleanup ON "RateLimitBucket" FOR DELETE
  USING (current_setting('app.rate_limit_sweep', true) = 'true');

GRANT SELECT, INSERT, UPDATE, DELETE ON "CollegeApplication" TO campusconnect_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CollegeAdminInvitation" TO campusconnect_app;
GRANT SELECT, INSERT ON "PlatformAuditLog" TO campusconnect_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "RateLimitBucket" TO campusconnect_app;
