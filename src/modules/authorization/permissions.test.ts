import { describe, expect, it } from "vitest";
import { MembershipRole } from "@/generated/prisma/enums";
import { hasPermission, requireDepartmentAccess, requirePermission } from "./permissions";
import { AuthorizationError } from "@/lib/errors";

const principal = (role: MembershipRole, assignedDepartments: string[] = []) => ({
  kind: "membership" as const,
  userId: "user-1",
  collegeId: "college-a",
  membershipId: "membership-1",
  role,
  status: "ACTIVE" as const,
  assignedDepartments
});

describe("role permissions", () => {
  it("enforces the permission matrix for every college role and the platform role", () => {
    const root = { kind: "platform_admin" as const, userId: "root", active: true };
    const inactiveRoot = { ...root, active: false };
    expect(hasPermission(root, "college:manage")).toBe(true);
    expect(hasPermission(inactiveRoot, "college:manage")).toBe(false);
    expect(hasPermission(principal(MembershipRole.COLLEGE_ADMIN), "college:manage")).toBe(true);
    expect(hasPermission(principal(MembershipRole.COLLEGE_ADMIN), "staff:manage")).toBe(true);
    expect(hasPermission(principal(MembershipRole.COLLEGE_ADMIN), "departments:manage")).toBe(true);
    expect(hasPermission(principal(MembershipRole.COLLEGE_ADMIN), "reports:read")).toBe(true);
    expect(hasPermission(principal(MembershipRole.PLACEMENT_OFFICER), "drives:write")).toBe(true);
    expect(hasPermission(principal(MembershipRole.PLACEMENT_OFFICER), "college:manage")).toBe(false);
    expect(hasPermission(principal(MembershipRole.PLACEMENT_OFFICER), "staff:manage")).toBe(false);
    expect(hasPermission(principal(MembershipRole.PLACEMENT_OFFICER), "departments:manage")).toBe(false);
    expect(hasPermission(principal(MembershipRole.COORDINATOR, ["CSE"]), "students:write")).toBe(true);
    expect(hasPermission(principal(MembershipRole.COORDINATOR), "drives:write")).toBe(false);
    expect(hasPermission(principal(MembershipRole.COORDINATOR), "staff:manage")).toBe(false);
    expect(hasPermission(principal(MembershipRole.COORDINATOR), "departments:manage")).toBe(false);
    expect(hasPermission(principal(MembershipRole.STUDENT), "students:own:write")).toBe(true);
    expect(hasPermission(principal(MembershipRole.STUDENT), "registrations:own:create")).toBe(true);
    expect(hasPermission(principal(MembershipRole.STUDENT), "drives:write")).toBe(false);
  });

  it("allows placement officers to create drives", () => {
    expect(hasPermission(principal(MembershipRole.PLACEMENT_OFFICER), "drives:write")).toBe(true);
  });

  it("does not allow students to manage registrations", () => {
    expect(hasPermission(principal(MembershipRole.STUDENT), "registrations:manage")).toBe(false);
  });

  it("blocks students from creating placement drives", () => {
    expect(() => requirePermission(principal(MembershipRole.STUDENT), "drives:write")).toThrow(AuthorizationError);
  });

  it("requires coordinator assignment for department access", () => {
    expect(() => requireDepartmentAccess(principal(MembershipRole.COORDINATOR, ["CSE"]), "ECE")).toThrow(AuthorizationError);
    expect(() => requireDepartmentAccess(principal(MembershipRole.COORDINATOR, ["CSE"]), "CSE")).not.toThrow();
  });

  it("lets placement officers cover college departments", () => {
    expect(() => requireDepartmentAccess(principal(MembershipRole.PLACEMENT_OFFICER), "ECE")).not.toThrow();
  });

  it("keeps the platform super admin outside college memberships", () => {
    expect(hasPermission({ kind: "platform_admin", userId: "root", active: true }, "college:manage")).toBe(true);
    expect(hasPermission({ kind: "platform_admin", userId: "root", active: false }, "college:manage")).toBe(false);
  });
});
