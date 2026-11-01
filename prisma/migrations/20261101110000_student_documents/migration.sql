-- Phase 3C: private student document metadata with tenant-enforced access.
BEGIN;
CREATE TYPE "StudentDocumentCategory" AS ENUM ('RESUME', 'ACADEMIC_CERTIFICATE', 'SUPPORTING_DOCUMENT');

CREATE TABLE "StudentDocument" (
  "id" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "collegeId" UUID NOT NULL,
  "category" "StudentDocumentCategory" NOT NULL,
  "originalName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "extension" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "uploadedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentDocument_studentId_collegeId_fkey" FOREIGN KEY ("studentId", "collegeId") REFERENCES "StudentProfile"("id", "collegeId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentDocument_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentDocument_size_check" CHECK ("sizeBytes" > 0),
  CONSTRAINT "StudentDocument_storage_key_check" CHECK ("storageKey" !~ '[\\\\/]' OR "storageKey" LIKE 'documents/%')
);
CREATE UNIQUE INDEX "StudentDocument_storageKey_key" ON "StudentDocument"("storageKey");
CREATE UNIQUE INDEX "StudentDocument_studentId_category_key" ON "StudentDocument"("studentId", "category");
CREATE UNIQUE INDEX "StudentDocument_id_collegeId_key" ON "StudentDocument"("id", "collegeId");
CREATE INDEX "StudentDocument_collegeId_studentId_category_idx" ON "StudentDocument"("collegeId", "studentId", "category");

ALTER TABLE "StudentDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY student_document_tenant ON "StudentDocument"
  USING ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK ("collegeId" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

REVOKE ALL ON "StudentDocument" FROM campusconnect_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "StudentDocument" TO campusconnect_app;
COMMIT;
