import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import 'dotenv/config';

const testAdminUrl = process.env.TEST_ADMIN_DATABASE_URL ?? deriveDatabaseUrl(process.env.DATABASE_URL, 'campusconnect_test');
const targets = [
  ['development', process.env.DATABASE_URL],
  ['test', testAdminUrl]
].filter(([, url]) => Boolean(url));
const migrations = [
  '20261030170000_college_onboarding_auth',
  '20261030171000_invitation_activation_select_policy'
];
if (!targets.length) throw new Error('No database URLs are configured.');

for (const [label, connectionString] of targets) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const { rows: [metadata] } = await pool.query(`SELECT current_database() AS db, current_user AS role`);
    const { rows: [duplicates] } = await pool.query(`SELECT count(*)::int AS duplicate_groups FROM (
      SELECT lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')) AS normalized
      FROM "College" GROUP BY 1 HAVING count(*) > 1
    ) grouped`);
    const { rows: [migration] } = await pool.query(`SELECT count(*)::int AS already_applied
      FROM "_prisma_migrations" WHERE migration_name = '20261030170000_college_onboarding_auth' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`);
    const { rows: [connections] } = await pool.query(`SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename='campusconnect_app' AND datname=current_database()`);
    process.stdout.write(`${label}: connected; database=${metadata.db}; role=${metadata.role}; normalized-name conflicts=${duplicates.duplicate_groups}; onboarding migration applied=${migration.already_applied > 0}; app-role sessions=${connections.count}\n`);
    for (const name of migrations) {
      const path = `prisma/migrations/${name}/migration.sql`;
      const expected = createHash('sha256').update(readFileSync(path)).digest('hex');
      const applied = await pool.query(`SELECT checksum FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`, [name]);
      if (applied.rowCount !== 1 || applied.rows[0].checksum !== expected) throw new Error(`${label}: migration ${name} is missing or its checksum differs from disk.`);
      process.stdout.write(`  ${name}: applied checksum matches file\n`);
    }
    if (label === 'test') {
      const { rows: [residue] } = await pool.query(`SELECT
        (SELECT count(*)::int FROM "CollegeApplication" WHERE "contactEmail" LIKE 'phase2a-%' OR "contactEmail" LIKE 'rejected-%' OR "contactEmail" LIKE 'college-contact-e2e-%') AS applications,
        (SELECT count(*)::int FROM "User" WHERE email LIKE 'platform-%@example.invalid' OR email LIKE 'college-admin-%@example.invalid') AS users,
        (SELECT count(*)::int FROM "CollegeAdminInvitation" i JOIN "CollegeApplication" a ON a.id=i."applicationId" WHERE a."contactEmail" LIKE 'phase2a-%' OR a."contactEmail" LIKE 'rejected-%' OR a."contactEmail" LIKE 'college-contact-e2e-%') AS invitations`);
      process.stdout.write(`  synthetic onboarding residue: applications=${residue.applications}, users=${residue.users}, invitations=${residue.invitations}\n`);
      if (residue.applications) {
        const { rows: groups } = await pool.query(`SELECT CASE
          WHEN "contactEmail" LIKE 'phase2a-%' THEN 'postgres-integration'
          WHEN "contactEmail" LIKE 'rejected-%' THEN 'postgres-rejection'
          WHEN "contactEmail" LIKE 'college-contact-e2e-%' THEN 'browser-e2e'
          ELSE 'other-synthetic-pattern' END AS source, status, count(*)::int AS count
          FROM "CollegeApplication" WHERE "contactEmail" LIKE 'phase2a-%' OR "contactEmail" LIKE 'rejected-%' OR "contactEmail" LIKE 'college-contact-e2e-%'
          GROUP BY 1,2 ORDER BY 1,2`);
        for (const group of groups) process.stdout.write(`  remaining source=${group.source}, status=${group.status}, count=${group.count}\n`);
      }
      if (residue.applications || residue.users || residue.invitations) throw new Error('Synthetic onboarding fixtures remain in campusconnect_test.');
    }
    if (duplicates.duplicate_groups) throw new Error(`${label} has conflicting college names; migration must not be deployed until resolved.`);
  } finally {
    await pool.end();
  }
}

function deriveDatabaseUrl(source, database) {
  if (!source) return undefined;
  const parsed = new URL(source);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}
