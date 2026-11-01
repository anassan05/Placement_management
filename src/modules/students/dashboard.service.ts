import { AuthorizationError } from "@/lib/errors";
import { requirePermission, type Principal } from "@/modules/authorization/permissions";
import { withTenantTransaction } from "@/modules/tenancy/tenant-context";

type CompletionField = "fullName" | "registerNumber" | "departmentCode" | "batchYear" | "phone" | "dateOfBirth" | "cgpa" | "standingArrears" | "resume" | "academicCertificate";

export type StudentDashboard = {
  student: {
    id: string;
    fullName: string;
    registerNumber: string;
    departmentCode: string;
    batchYear: number;
    phone: string | null;
    dateOfBirth: Date | null;
    verificationStatus: string;
  };
  academics: {
    cgpa: string | null;
    tenthPercentage: string | null;
    twelfthPercentage: string | null;
    standingArrears: number | null;
    historyOfArrears: boolean | null;
  } | null;
  documents: {
    resume: { id: string; originalName: string } | null;
    academicCertificate: { id: string; originalName: string } | null;
    supportingCount: number;
  };
  completion: {
    percentage: number;
    completed: number;
    total: number;
    fields: Record<CompletionField, boolean>;
  };
  registrations: Array<{
    id: string;
    title: string;
    companyName: string;
    status: string;
    registeredAt: Date;
    deadlineAt: Date | null;
  }>;
};

const completionFields: CompletionField[] = [
  "fullName", "registerNumber", "departmentCode", "batchYear", "phone",
  "dateOfBirth", "cgpa", "standingArrears", "resume", "academicCertificate"
];

export async function getStudentDashboard(principal: Principal): Promise<StudentDashboard | null> {
  if (principal.kind !== "membership") throw new AuthorizationError("College membership is required.");
  requirePermission(principal, "students:own:read");

  return withTenantTransaction(principal, async (tx) => {
    const profile = await tx.studentProfile.findUnique({
      where: { membershipId: principal.membershipId },
      select: {
        id: true,
        fullName: true,
        registerNumber: true,
        departmentCode: true,
        batchYear: true,
        phone: true,
        dateOfBirth: true,
        verificationStatus: true,
        academics: {
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          select: { cgpa: true, tenthPercentage: true, twelfthPercentage: true, standingArrears: true, historyOfArrears: true }
        },
        documents: {
          select: { id: true, category: true, originalName: true }
        },
        registrations: {
          where: { status: "REGISTERED" },
          orderBy: { registeredAt: "desc" },
          select: {
            id: true,
            status: true,
            registeredAt: true,
            drive: { select: { title: true, deadlineAt: true, company: { select: { name: true } } } }
          }
        }
      }
    });
    if (!profile) return null;

    const academics = profile.academics[0]
      ? {
          cgpa: profile.academics[0].cgpa?.toString() ?? null,
          tenthPercentage: profile.academics[0].tenthPercentage?.toString() ?? null,
          twelfthPercentage: profile.academics[0].twelfthPercentage?.toString() ?? null,
          standingArrears: profile.academics[0].standingArrears,
          historyOfArrears: profile.academics[0].historyOfArrears
        }
      : null;
    const resume = profile.documents.find((document) => document.category === "RESUME") ?? null;
    const academicCertificate = profile.documents.find((document) => document.category === "ACADEMIC_CERTIFICATE") ?? null;
    const fields: Record<CompletionField, boolean> = {
      fullName: Boolean(profile.fullName),
      registerNumber: Boolean(profile.registerNumber),
      departmentCode: Boolean(profile.departmentCode),
      batchYear: Boolean(profile.batchYear),
      phone: Boolean(profile.phone),
      dateOfBirth: Boolean(profile.dateOfBirth),
      cgpa: Boolean(academics?.cgpa),
      standingArrears: academics?.standingArrears !== null && academics?.standingArrears !== undefined,
      resume: Boolean(resume),
      academicCertificate: Boolean(academicCertificate)
    };
    const completed = completionFields.filter((field) => fields[field]).length;

    return {
      student: {
        id: profile.id,
        fullName: profile.fullName,
        registerNumber: profile.registerNumber,
        departmentCode: profile.departmentCode,
        batchYear: profile.batchYear,
        phone: profile.phone,
        dateOfBirth: profile.dateOfBirth,
        verificationStatus: profile.verificationStatus
      },
      academics,
      documents: {
        resume: resume ? { id: resume.id, originalName: resume.originalName } : null,
        academicCertificate: academicCertificate ? { id: academicCertificate.id, originalName: academicCertificate.originalName } : null,
        supportingCount: profile.documents.filter((document) => document.category === "SUPPORTING_DOCUMENT").length
      },
      completion: {
        percentage: Math.round((completed / completionFields.length) * 100),
        completed,
        total: completionFields.length,
        fields
      },
      registrations: profile.registrations.map((registration) => ({
        id: registration.id,
        title: registration.drive.title,
        companyName: registration.drive.company.name,
        status: registration.status,
        registeredAt: registration.registeredAt,
        deadlineAt: registration.drive.deadlineAt
      }))
    };
  });
}
