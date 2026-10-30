ALTER TABLE "Session"
ADD COLUMN "activeCollegeId" UUID;

CREATE INDEX "Session_activeCollegeId_idx" ON "Session"("activeCollegeId");

ALTER TABLE "Session"
ADD CONSTRAINT "Session_activeCollegeId_fkey"
FOREIGN KEY ("activeCollegeId") REFERENCES "College"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
