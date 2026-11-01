import { describe, expect, it } from "vitest";
import { studentAcceptanceSchema, studentInvitationSchema } from "./validation";

describe("student invitation validation", () => {
  it("normalizes enrollment identity and accepts valid input", () => {
    expect(studentInvitationSchema.parse({
      fullName: "  Student Name ",
      email: "STUDENT@EXAMPLE.EDU",
      registerNumber: " cs/01 ",
      departmentId: "11111111-1111-4111-8111-111111111111",
      batchYear: "2026"
    })).toMatchObject({
      fullName: "Student Name",
      email: "student@example.edu",
      registerNumber: "CS/01",
      batchYear: 2026
    });
  });

  it("rejects malformed enrollment identity and mismatched passwords", () => {
    expect(() => studentInvitationSchema.parse({
      fullName: "Student",
      email: "student@example.edu",
      registerNumber: "bad space",
      departmentId: "11111111-1111-4111-8111-111111111111",
      batchYear: 2026
    })).toThrow();
    expect(studentAcceptanceSchema.safeParse({ password: "A-valid-password-1", confirmPassword: "different-password-1" }).success).toBe(false);
  });
});
