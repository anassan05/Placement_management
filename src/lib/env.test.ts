import { describe, expect, it } from "vitest";
import { parseEnvironment } from "./env-schema";

describe("environment validation", () => {
  it("rejects missing and non-PostgreSQL database URLs", () => {
    expect(() => parseEnvironment({})).toThrow();
    expect(() => parseEnvironment({ DATABASE_URL: "https://example.com", APP_DATABASE_URL: "postgresql://localhost/app" })).toThrow();
  });

  it("accepts a PostgreSQL URL and applies safe local defaults", () => {
    expect(parseEnvironment({ DATABASE_URL: "postgresql://localhost/campusconnect", APP_DATABASE_URL: "postgresql://localhost/campusconnect" })).toMatchObject({
      APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    });
  });
});
