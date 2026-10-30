import { describe, expect, it } from "vitest";
import { collegeApplicationSchema, normalizeCollegeName } from "./validation";

const valid = {
  collegeName: "  Synthetic   College ", shortName: "Syn", websiteUrl: "", contactEmail: "INFO@EXAMPLE.EDU",
  contactPhone: "+1 (555) 010-1000", state: "Synthetic State", district: "Test District",
  address: "100 Test Road, Synthetic District", administratorName: "Test Administrator",
  administratorEmail: "ADMIN@EXAMPLE.EDU", message: "", companyWebsite: ""
};

describe("college application validation", () => {
  it("normalizes submitted identity fields and email addresses", () => {
    const parsed = collegeApplicationSchema.parse(valid);
    expect(parsed.collegeName).toBe("Synthetic College");
    expect(parsed.contactEmail).toBe("info@example.edu");
    expect(parsed.administratorEmail).toBe("admin@example.edu");
    expect(parsed.message).toBeNull();
    expect(normalizeCollegeName(" SYNTHETIC   COLLEGE ")).toBe("synthetic college");
  });

  it("rejects invalid websites, contact details, and overlong input", () => {
    expect(collegeApplicationSchema.safeParse({ ...valid, websiteUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(collegeApplicationSchema.safeParse({ ...valid, contactEmail: "not-email" }).success).toBe(false);
    expect(collegeApplicationSchema.safeParse({ ...valid, collegeName: "x".repeat(181) }).success).toBe(false);
  });

  it("retains the honeypot value for server-side rejection", () => {
    expect(collegeApplicationSchema.parse({ ...valid, companyWebsite: "https://bot.example" }).companyWebsite).toBe("https://bot.example");
  });
});
