import { describe, expect, it } from "vitest";
import { createSessionToken, getSessionCookieOptions, hashPassword, hashSessionToken, verifyPassword, verifySessionToken } from "./session";

describe("credential primitives", () => {
  it("stores only a hash of opaque session tokens", () => {
    const token = createSessionToken();
    expect(token).not.toBe(hashSessionToken(token));
    expect(verifySessionToken(token, hashSessionToken(token))).toBe(true);
    expect(verifySessionToken("wrong", hashSessionToken(token))).toBe(false);
  });

  it("hashes passwords with a salted memory-hard scrypt derivation", async () => {
    const encoded = await hashPassword("a-long-test-password-123");
    expect(encoded).toMatch(/^scrypt\$32768\$/);
    expect(await verifyPassword("a-long-test-password-123", encoded)).toBe(true);
    expect(await verifyPassword("not-the-password", encoded)).toBe(false);
  });

  it("sets HttpOnly, SameSite=Lax cookies and Secure in production", () => {
    expect(getSessionCookieOptions("production")).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(getSessionCookieOptions("development")).toMatchObject({ httpOnly: true, secure: false, sameSite: "lax" });
  });
});
