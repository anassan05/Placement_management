import { notFound } from "next/navigation";
import { requireMembershipPage } from "@/modules/tenancy/page-auth";
import { getStudent } from "@/modules/students/student.service";
import { listStudentDocuments } from "@/modules/students/document.service";
import { DocumentsPanel } from "./documents-panel";

export default async function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requireMembershipPage();
  const { id } = await params;
  const student = await getStudent(principal, id);
  if (!student) notFound();
  const documents = await listStudentDocuments(principal, id);
  return <main className="mx-auto max-w-3xl px-5 py-10"><h1 className="text-3xl font-bold">{student.fullName}</h1><DocumentsPanel studentId={id} documents={documents} /></main>;
}
