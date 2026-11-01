import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveMembershipPrincipal } from "@/modules/tenancy/tenant-context";
import { getStudentDocument } from "@/modules/students/document.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studentId: string; documentId: string }> }
) {
  try {
    const token = (await cookies()).get("cc_session")?.value;
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const principal = await resolveMembershipPrincipal(token);
    const { studentId, documentId } = await params;
    const document = await getStudentDocument(principal, studentId, documentId);
    return new NextResponse(new Uint8Array(document.bytes), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Length": String(document.sizeBytes),
        "Content-Disposition": `attachment; filename="${document.originalName.replace(/["\r\n]/g, "_")}"`
      }
    });
  } catch {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
}
