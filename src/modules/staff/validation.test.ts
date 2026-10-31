import { describe, expect, it } from "vitest";
import { departmentSchema, staffInvitationSchema, staffRoleSchema } from "./validation";

describe("Phase 2B validation", () => {
  it("accepts only Placement Officer and Coordinator invitation roles", () => {
    expect(staffRoleSchema.safeParse("PLACEMENT_OFFICER").success).toBe(true);
    expect(staffRoleSchema.safeParse("COORDINATOR").success).toBe(true);
    for (const role of ["COLLEGE_ADMIN", "PLATFORM_SUPER_ADMIN", "STUDENT", "UNKNOWN"]) {
      expect(staffRoleSchema.safeParse(role).success).toBe(false);
    }
  });

  it("normalizes email and requires departments only for Coordinators", () => {
    const departmentId = "1b359a6a-8ae8-4953-a48a-cc837f722d00";
    expect(staffInvitationSchema.parse({ fullName: "  Test Staff ", email: " STAFF@Example.com ", role: "PLACEMENT_OFFICER" })).toMatchObject({ email: "staff@example.com", departmentIds: [] });
    expect(staffInvitationSchema.safeParse({ fullName: "Coordinator", email: "c@example.com", role: "COORDINATOR" }).success).toBe(false);
    expect(staffInvitationSchema.safeParse({ fullName: "Coordinator", email: "c@example.com", role: "COORDINATOR", departmentIds: [departmentId] }).success).toBe(true);
    expect(staffInvitationSchema.safeParse({ fullName: "Officer", email: "o@example.com", role: "PLACEMENT_OFFICER", departmentIds: [departmentId] }).success).toBe(false);
  });

  it("normalizes department codes and rejects malformed values", () => {
    expect(departmentSchema.parse({ name: " Computer Science ", shortCode: "cse" })).toMatchObject({ name: "Computer Science", shortCode: "CSE" });
    expect(departmentSchema.safeParse({ name: "X", shortCode: "bad code" }).success).toBe(false);
  });
});
