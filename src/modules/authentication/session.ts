import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const SESSION_TOKEN_BYTES = 32;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function deriveKey(password: string, salt: Buffer, keyLength: number, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, { N: cost, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export function createSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifySessionToken(token: string, storedHash: string): boolean {
  const actual = Buffer.from(hashSessionToken(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error("Password must contain at least 12 characters.");
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, 64, 1 << 15);
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, saltText, keyText] = encoded.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, "base64url");
  if (Number(n) !== 1 << 15 || Number(r) !== 8 || Number(p) !== 1 || expected.length !== 64) return false;
  const actual = await deriveKey(password, Buffer.from(saltText, "base64url"), expected.length, Number(n));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function getSessionCookieOptions(nodeEnv = process.env.NODE_ENV) {
  return {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  };
}

export const sessionCookieOptions = getSessionCookieOptions();
