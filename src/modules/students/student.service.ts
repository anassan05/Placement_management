import { AuthorizationError } from "@/lib/errors";
import { requirePermission, type Principal } from "@/modules/authorization/permissions";
import { withTenantTransaction } from "@/modules/tenancy/tenant-context";
import { studentProfileSchema, academicRecordSchema } from "./validation";

export async function listStudents(principal: Principal) {
  if (principal.kind !== "membership") throw new AuthorizationError("College membership is required.");
  requirePermission(principal, "students:read");
  return withTenantTransaction(principal, async (tx) => {
    const where = principal.role === "COORDINATOR"
      ? { departmentCode: { in: [...principal.assignedDepartments] } }
      : {};
    return tx.studentProfile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: { id: true, fullName: true, registerNumber: true, departmentCode: true, batchYear: true, verificationStatus: true, createdAt: true, membership: { select: { status: true } } }
    });
  });
}

export async function getStudent(principal: Principal, id: string) {
  if (principal.kind !== "membership") throw new AuthorizationError("College membership is required.");
  requirePermission(principal, "students:read");
  return withTenantTransaction(principal, async (tx) => {
    const student = await tx.studentProfile.findUnique({
      where: { id },
      select: { id: true, fullName: true, registerNumber: true, departmentCode: true, batchYear: true, phone: true, dateOfBirth: true, verificationStatus: true, academics: { orderBy: { effectiveFrom: "desc" }, take: 1, select: { cgpa: true, tenthPercentage: true, twelfthPercentage: true, standingArrears: true, historyOfArrears: true } } }
    });
    if (!student) return null;
    if (principal.role === "COORDINATOR" && !principal.assignedDepartments.includes(student.departmentCode)) throw new AuthorizationError("You do not have access to this student.");
    return student;
  });
}

export async function updateStudentProfile(principal: Principal, id: string, raw: unknown) {
  if (principal.kind !== "membership") throw new AuthorizationError("College membership is required.");
  requirePermission(principal, "students:write");
  const input = studentProfileSchema.parse(raw);
  return withTenantTransaction(principal, async (tx) => {
    const existing = await tx.studentProfile.findUnique({ where: { id }, select: { departmentCode: true } });
    if (!existing) throw new AuthorizationError("Student not found.");
    if (principal.role === "COORDINATOR" && !principal.assignedDepartments.includes(existing.departmentCode)) throw new AuthorizationError("You do not have access to this student.");
    if (principal.role === "COORDINATOR" && !principal.assignedDepartments.includes(input.departmentCode)) throw new AuthorizationError("You do not have access to this department.");
    return tx.studentProfile.update({ where: { id }, data: input });
  });
}

export async function updateAcademicRecord(principal: Principal, studentId: string, raw: unknown) {
  if (principal.kind !== "membership") throw new AuthorizationError("College membership is required.");
  requirePermission(principal, "students:write");
  const input = academicRecordSchema.parse(raw);
  return withTenantTransaction(principal, async (tx) => {
    const student = await tx.studentProfile.findUnique({ where: { id: studentId }, select: { departmentCode: true } });
    if (!student) throw new AuthorizationError("Student not found.");
    if (principal.role === "COORDINATOR" && !principal.assignedDepartments.includes(student.departmentCode)) throw new AuthorizationError("You do not have access to this student.");
    return tx.academicRecord.create({ data: { id: crypto.randomUUID(), studentId, ...input } });
  });
}
