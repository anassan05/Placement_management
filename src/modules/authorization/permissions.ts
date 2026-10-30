import { MembershipRole } from "@/generated/prisma/enums";
import { AuthorizationError } from "@/lib/errors";

export type Permission =
  | "college:manage"
  | "students:read"
  | "students:write"
  | "students:own:read"
  | "students:own:write"
  | "drives:read"
  | "drives:write"
  | "registrations:read"
  | "registrations:manage"
  | "registrations:own:read"
  | "registrations:own:create"
  | "reports:read"
  | "platform:applications:manage"
  | "platform:colleges:manage"

export type Principal =
  | { kind: "platform_admin"; userId: string; active: boolean }
  | {
      kind: "membership";
      userId: string;
      collegeId: string;
      membershipId: string;
      role: MembershipRole;
      status: "ACTIVE";
      assignedDepartments: readonly string[];
    };

const rolePermissions: Record<MembershipRole, Permission[]> = {
  COLLEGE_ADMIN: [
    "college:manage", "students:read", "students:write",
    "drives:read", "drives:write", "registrations:read",
    "registrations:manage", "reports:read"
  ],
  PLACEMENT_OFFICER: [
    "students:read", "students:write", "drives:read", "drives:write",
    "registrations:read", "registrations:manage", "reports:read"
  ],
  COORDINATOR: [
    "students:read", "students:write", "drives:read",
    "registrations:read", "registrations:manage", "reports:read"
  ],
  HOD: ["students:read", "drives:read", "registrations:read", "reports:read"],
  STUDENT: ["drives:read", "students:own:read", "students:own:write", "registrations:own:read", "registrations:own:create"]
};

export function hasPermission(
  principal: Principal,
  permission: Permission
): boolean {
  if (principal.kind === "platform_admin") return principal.active;
  return principal.status === "ACTIVE" && rolePermissions[principal.role].includes(permission);
}

export function requirePermission(principal: Principal, permission: Permission): void {
  if (!hasPermission(principal, permission)) {
    throw new AuthorizationError("You do not have permission to perform this action.");
  }
}

export function requireDepartmentAccess(principal: Principal, departmentCode: string): void {
  if (principal.kind === "platform_admin") {
    if (!principal.active) throw new AuthorizationError("You do not have access to this department.");
    return;
  }
  if (
    principal.status !== "ACTIVE" ||
    (["COORDINATOR", "HOD"].includes(principal.role) &&
      !principal.assignedDepartments.includes(departmentCode))
  ) {
    throw new AuthorizationError("You do not have access to this department.");
  }
}
