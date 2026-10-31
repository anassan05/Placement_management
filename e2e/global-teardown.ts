import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";

export default async function globalTeardown() {
  const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
  const fixturePath = resolve("test-results", ".e2e-fixture.json");
  if (!existsSync(fixturePath)) return;
  const { userId: platformUserId, marker, email: platformEmail, staffAcceptKeyHashes = [] } = JSON.parse(readFileSync(fixturePath, "utf8")) as { userId: string; marker: string; email: string; password: string; staffAcceptKeyHashes?: string[] };
  const adminEmail = marker ? `college-admin-e2e-${marker}@example.invalid` : "";
  const contactEmail = marker ? `college-contact-e2e-${marker}@example.invalid` : "";
  const staffEmails = [`placement-officer-e2e-${marker}@example.invalid`, `coordinator-e2e-${marker}@example.invalid`];
  if (!adminUrl || !platformUserId || !marker || !platformEmail) return;
  const pool = new Pool({ connectionString: adminUrl, max: 1 });
  let staffInviteKeyHashes: string[] = [];
  try {
    await pool.query("BEGIN");
    const colleges = await pool.query(`SELECT c.id FROM "College" c JOIN "CollegeApplication" a ON a."collegeId"=c.id WHERE a."administratorEmail"=$1`, [adminEmail]);
    const ids = colleges.rows.map((row) => row.id as string);
    const adminUser = await pool.query('SELECT id FROM "User" WHERE email=$1', [adminEmail]);
    if (adminUser.rows[0]) staffInviteKeyHashes = ids.map((collegeId) => createHash("sha256").update(`staff-invite:${collegeId}:${adminUser.rows[0].id}`).digest("hex"));
    await pool.query(`DELETE FROM "Session" WHERE "userId"=$1 OR "activeCollegeId"=ANY($2::uuid[])`, [platformUserId, ids]);
    await pool.query(`DELETE FROM "AuditLog" WHERE "collegeId"=ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM "StaffInvitation" WHERE "collegeId"=ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM "CollegeAdminInvitation" WHERE "applicationId" IN (SELECT id FROM "CollegeApplication" WHERE "administratorEmail"=$1)`, [adminEmail]);
    await pool.query(`DELETE FROM "PlatformAuditLog" WHERE "actorUserId"=$1`, [platformUserId]);
    await pool.query(`DELETE FROM "CollegeApplication" WHERE "administratorEmail"=$1`, [adminEmail]);
    await pool.query(`DELETE FROM "Membership" WHERE "collegeId"=ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM "College" WHERE id=ANY($1::uuid[])`, [ids]);
    await pool.query(`DELETE FROM "User" WHERE id=$1 OR email=ANY($2::text[])`, [platformUserId, [adminEmail, ...staffEmails]]);
    const hashes = [
      createHash("sha256").update(`college-application:${contactEmail}`).digest("hex"),
      createHash("sha256").update(`login:${createHash("sha256").update(platformEmail).digest("hex")}`).digest("hex"),
      ...staffInviteKeyHashes,
      ...staffEmails.map((email) => createHash("sha256").update(`login:${createHash("sha256").update(email).digest("hex")}`).digest("hex")),
      ...staffAcceptKeyHashes
    ];
    await pool.query(`DELETE FROM "RateLimitBucket" WHERE "keyHash"=ANY($1::text[])`, [hashes]);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await pool.end();
    unlinkSync(fixturePath);
  }
}
