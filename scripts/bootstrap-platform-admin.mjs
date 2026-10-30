import { randomUUID, scrypt as scryptCallback, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Client } from 'pg';
import 'dotenv/config';

if (!stdin.isTTY || !stdout.isTTY) throw new Error('Run this bootstrap command in an interactive terminal.');
const rl = createInterface({ input: stdin, output: stdout });
const email = (await rl.question('Platform administrator email: ')).trim().toLowerCase();
const displayName = (await rl.question('Display name: ')).trim();
rl.close();
const password = await readHidden('Password (12+ characters): ');
const confirm = await readHidden('Confirm password: ');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !displayName || displayName.length > 140) throw new Error('Enter a valid email and display name.');
if (password.length < 12 || password !== confirm) throw new Error('Password confirmation failed or password is too short.');
if (!process.env.BOOTSTRAP_DATABASE_URL) throw new Error('Set BOOTSTRAP_DATABASE_URL to a privileged PostgreSQL connection for this one-time operation.');

const salt = randomBytes(16);
const key = await new Promise((resolve, reject) => scryptCallback(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result)));
const passwordHash = `scrypt$32768$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
const client = new Client({ connectionString: process.env.BOOTSTRAP_DATABASE_URL, ssl: process.env.BOOTSTRAP_DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['campusconnect-platform-admin-bootstrap']);
  const { rows: [role] } = await client.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
  if (!role?.rolsuper && !role?.rolbypassrls) throw new Error('Bootstrap database role must bypass forced RLS for this protected one-time operation.');
  const { rows: [count] } = await client.query('SELECT count(*)::int AS count FROM "User" WHERE "isPlatformAdmin" = true');
  if (count.count !== 0) throw new Error('A platform administrator already exists; bootstrap is disabled.');
  const now = new Date();
  await client.query('INSERT INTO "User" (id,email,"passwordHash","displayName","isPlatformAdmin","isActive","createdAt","updatedAt") VALUES ($1,$2,$3,$4,true,true,$5,$5)', [randomUUID(), email, passwordHash, displayName, now]);
  await client.query('COMMIT');
  stdout.write('Platform administrator created. The password was not logged.\n');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
}

async function readHidden(prompt) {
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  let value = '';
  try {
    for await (const chunk of stdin) {
      for (const byte of chunk) {
        if (byte === 13 || byte === 10) { stdout.write('\n'); return value; }
        if (byte === 3) throw new Error('Cancelled.');
        if (byte === 127 || byte === 8) value = value.slice(0, -1);
        else value += String.fromCharCode(byte);
      }
    }
    return value;
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
  }
}
