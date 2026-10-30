import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { hashPassword } from "../src/modules/authentication/session";

export default async function globalSetup() {
  const userId = randomUUID();
  const marker = randomBytes(5).toString("hex");
  const email = `platform-e2e-${marker}@example.invalid`;
  const password = `${randomBytes(20).toString("base64url")}A1!`;
  const adminUrl = required("TEST_ADMIN_DATABASE_URL");
  if (new URL(adminUrl).pathname.replace(/^\//, "") !== "campusconnect_test") throw new Error("End-to-end fixtures may only use campusconnect_test.");
  process.env.E2E_PLATFORM_USER_ID = userId;
  process.env.E2E_MARKER = marker;
  process.env.E2E_PLATFORM_EMAIL = email;
  process.env.E2E_PLATFORM_PASSWORD = password;
  const fixturePath = resolve("test-results", ".e2e-fixture.json");
  mkdirSync(resolve("test-results"), { recursive: true });
  const pool = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    const passwordHash = await hashPassword(password);
    await pool.query(`INSERT INTO "User" (id,email,"passwordHash","displayName","isPlatformAdmin","isActive","createdAt","updatedAt")
      VALUES ($1,$2,$3,'Synthetic E2E Platform Admin',true,true,now(),now())`, [userId, email, passwordHash]);
    writeFileSync(fixturePath, JSON.stringify({ userId, marker, email, password }), { mode: 0o600 });
  } catch (error) {
    delete process.env.E2E_PLATFORM_USER_ID;
    delete process.env.E2E_MARKER;
    delete process.env.E2E_PLATFORM_EMAIL;
    delete process.env.E2E_PLATFORM_PASSWORD;
    throw error;
  } finally {
    await pool.end();
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for isolated end-to-end tests.`);
  return value;
}
