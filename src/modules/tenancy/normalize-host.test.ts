import { describe, expect, it } from "vitest";
import { isTrustedHost, normalizeHost } from "./normalize-host";

describe("tenant hostname handling", () => {
  it("normalizes case, port, and trailing dot", () => {
    expect(normalizeHost(" College.Example.edu.:443 ")).toBe("college.example.edu");
  });

  it("rejects malformed values and only trusts configured local hosts", () => {
    expect(normalizeHost("attacker@example.edu")).toBe("");
    expect(isTrustedHost("localhost:3000", ["localhost"])).toBe(true);
    expect(isTrustedHost("other.example.edu", ["localhost"])).toBe(false);
  });
});
