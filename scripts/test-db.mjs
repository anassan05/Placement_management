import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import 'dotenv/config';

const action = process.argv[2];
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL ?? derive(process.env.DATABASE_URL, 'campusconnect_test');
const runtimeUrl = process.env.TEST_DATABASE_URL ?? derive(process.env.APP_DATABASE_URL, 'campusconnect_test');
if (!adminUrl || !runtimeUrl) throw new Error('Development and runtime database connection settings are required.');
const admin = new URL(adminUrl);
const runtime = new URL(runtimeUrl);
if (admin.pathname.replace(/^\//, '') !== 'campusconnect_test' || runtime.pathname.replace(/^\//, '') !== 'campusconnect_test') {
  throw new Error('The test database helper only permits campusconnect_test for both database roles.');
}

if (action === 'cleanup-stale-fixture') {
  const pool = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    await pool.query('BEGIN');
    const { rows } = await pool.query(`SELECT id FROM "CollegeApplication"
      WHERE "contactEmail" LIKE 'phase2a-%@example.invalid' AND status='PENDING' AND "collegeId" IS NULL FOR UPDATE`);
    if (rows.length > 1) throw new Error('More than one matching pending synthetic fixture exists; refusing cleanup.');
    if (rows.length) {
      const { rows: [related] } = await pool.query(`SELECT count(*)::int AS count FROM "CollegeAdminInvitation" WHERE "applicationId"=$1`, [rows[0].id]);
      if (related.count) throw new Error('The synthetic application has related invitation data; refusing this narrow cleanup.');
      await pool.query('DELETE FROM "CollegeApplication" WHERE id=$1', [rows[0].id]);
    }
    await pool.query('COMMIT');
    process.stdout.write(`Removed ${rows.length} stale pending synthetic application fixture(s) from campusconnect_test.\n`);
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await pool.end();
  }
  process.exit(0);
}

let args;
if (action === 'status') args = ['node_modules/prisma/build/index.js', 'migrate', 'status'];
else if (action === 'deploy') args = ['node_modules/prisma/build/index.js', 'migrate', 'deploy'];
else if (action === 'guard-verify') args = ['scripts/deploy-db-guard.mjs', 'verify'];
else if (action === 'integration') args = ['node_modules/vitest/vitest.mjs', 'run'];
else throw new Error('Usage: node scripts/test-db.mjs status|deploy|guard-verify|integration|cleanup-stale-fixture');

const env = {
  ...process.env,
  DATABASE_URL: action === 'integration' ? process.env.DATABASE_URL : adminUrl,
  TEST_ADMIN_DATABASE_URL: adminUrl,
  TEST_DATABASE_URL: runtimeUrl
};
const result = spawnSync(process.execPath, args, { env, stdio: 'inherit', shell: false });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

function derive(source, database) {
  if (!source) return undefined;
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}
