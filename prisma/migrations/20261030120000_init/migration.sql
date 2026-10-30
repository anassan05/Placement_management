-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('COLLEGE_ADMIN', 'PLACEMENT_OFFICER', 'COORDINATOR', 'HOD', 'STUDENT');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "StudentVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DriveStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegistrationMode" AS ENUM ('IN_APP', 'EXTERNAL_LINK', 'INFO_ONLY');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "College" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "College_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollegeDomain" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollegeDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "displayName" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "registerNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "batchYear" INTEGER NOT NULL,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "verificationStatus" "StudentVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipDepartment" (
    "membershipId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipDepartment_pkey" PRIMARY KEY ("membershipId","departmentCode")
);

-- CreateTable
CREATE TABLE "AcademicRecord" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "cgpa" DECIMAL(4,2),
    "tenthPercentage" DECIMAL(5,2),
    "twelfthPercentage" DECIMAL(5,2),
    "standingArrears" INTEGER,
    "historyOfArrears" BOOLEAN,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedByUserId" UUID,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlacementDrive" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "jobRole" TEXT NOT NULL,
    "description" TEXT,
    "packageText" TEXT,
    "status" "DriveStatus" NOT NULL DEFAULT 'DRAFT',
    "registrationMode" "RegistrationMode" NOT NULL DEFAULT 'IN_APP',
    "registrationUrl" TEXT,
    "deadlineAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlacementDrive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveRule" (
    "id" UUID NOT NULL,
    "driveId" UUID NOT NULL,
    "ruleType" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriveRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "driveId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "method" "RegistrationMode" NOT NULL,
    "submittedData" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "College_slug_key" ON "College"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "College_code_key" ON "College"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CollegeDomain_hostname_key" ON "CollegeDomain"("hostname");

-- CreateIndex
CREATE INDEX "CollegeDomain_collegeId_idx" ON "CollegeDomain"("collegeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_userId_status_idx" ON "Membership"("userId", "status");

-- CreateIndex
CREATE INDEX "Membership_collegeId_role_status_idx" ON "Membership"("collegeId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_collegeId_userId_key" ON "Membership"("collegeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_id_collegeId_key" ON "Membership"("id", "collegeId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_membershipId_key" ON "StudentProfile"("membershipId");

-- CreateIndex
CREATE INDEX "StudentProfile_collegeId_departmentCode_batchYear_idx" ON "StudentProfile"("collegeId", "departmentCode", "batchYear");

-- CreateIndex
CREATE INDEX "StudentProfile_collegeId_verificationStatus_idx" ON "StudentProfile"("collegeId", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_collegeId_registerNumber_key" ON "StudentProfile"("collegeId", "registerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_id_collegeId_key" ON "StudentProfile"("id", "collegeId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_membershipId_collegeId_key" ON "StudentProfile"("membershipId", "collegeId");

-- CreateIndex
CREATE INDEX "MembershipDepartment_collegeId_departmentCode_idx" ON "MembershipDepartment"("collegeId", "departmentCode");

-- CreateIndex
CREATE INDEX "AcademicRecord_studentId_effectiveFrom_idx" ON "AcademicRecord"("studentId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "Company_collegeId_idx" ON "Company"("collegeId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_collegeId_name_key" ON "Company"("collegeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Company_id_collegeId_key" ON "Company"("id", "collegeId");

-- CreateIndex
CREATE INDEX "PlacementDrive_collegeId_status_deadlineAt_idx" ON "PlacementDrive"("collegeId", "status", "deadlineAt");

-- CreateIndex
CREATE INDEX "PlacementDrive_companyId_idx" ON "PlacementDrive"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PlacementDrive_id_collegeId_key" ON "PlacementDrive"("id", "collegeId");

-- CreateIndex
CREATE INDEX "DriveRule_driveId_idx" ON "DriveRule"("driveId");

-- CreateIndex
CREATE INDEX "Registration_collegeId_driveId_status_idx" ON "Registration"("collegeId", "driveId", "status");

-- CreateIndex
CREATE INDEX "Registration_studentId_registeredAt_idx" ON "Registration"("studentId", "registeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_driveId_studentId_key" ON "Registration"("driveId", "studentId");

-- CreateIndex
CREATE INDEX "AuditLog_collegeId_createdAt_idx" ON "AuditLog"("collegeId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "CollegeDomain" ADD CONSTRAINT "CollegeDomain_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_membershipId_collegeId_fkey" FOREIGN KEY ("membershipId", "collegeId") REFERENCES "Membership"("id", "collegeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipDepartment" ADD CONSTRAINT "MembershipDepartment_membershipId_collegeId_fkey" FOREIGN KEY ("membershipId", "collegeId") REFERENCES "Membership"("id", "collegeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicRecord" ADD CONSTRAINT "AcademicRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacementDrive" ADD CONSTRAINT "PlacementDrive_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlacementDrive" ADD CONSTRAINT "PlacementDrive_companyId_collegeId_fkey" FOREIGN KEY ("companyId", "collegeId") REFERENCES "Company"("id", "collegeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveRule" ADD CONSTRAINT "DriveRule_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "PlacementDrive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_driveId_collegeId_fkey" FOREIGN KEY ("driveId", "collegeId") REFERENCES "PlacementDrive"("id", "collegeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_studentId_collegeId_fkey" FOREIGN KEY ("studentId", "collegeId") REFERENCES "StudentProfile"("id", "collegeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

