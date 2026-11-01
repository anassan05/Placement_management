"use client";

import { useActionState } from "react";
import { deleteStudentDocumentAction, uploadStudentDocumentAction } from "@/app/actions/student";

const initialState: { error?: string; success?: string } = {};

export function DocumentsPanel({ studentId, documents }: { studentId: string; documents: Array<{ id: string; category: string; originalName: string; mimeType: string; sizeBytes: number; createdAt: Date }> }) {
  const [uploadState, uploadAction] = useActionState(uploadStudentDocumentAction, initialState);
  return (
    <section className="mt-8 rounded border p-5">
      <h2 className="text-xl font-semibold">Documents</h2>
      <ul className="mt-3 space-y-2">
        {documents.map((document) => (
          <li className="flex items-center justify-between gap-3 border-b py-2" key={document.id}>
            <a className="underline" href={`/api/college/students/${studentId}/documents/${document.id}`}>{document.originalName}</a>
            <span className="text-sm text-gray-600">{document.category} · {Math.ceil(document.sizeBytes / 1024)} KB</span>
            <form action={deleteStudentDocumentAction.bind(null, initialState)}>
              <input type="hidden" name="studentId" value={studentId} />
              <input type="hidden" name="documentId" value={document.id} />
              <button className="text-sm text-red-700 underline" type="submit">Delete</button>
            </form>
          </li>
        ))}
      </ul>
      <form action={uploadAction} className="mt-5 space-y-3">
        <input type="hidden" name="studentId" value={studentId} />
        <label className="block">Category
          <select className="ml-2 border p-1" name="category" required>
            <option value="RESUME">Resume</option>
            <option value="ACADEMIC_CERTIFICATE">Academic certificate</option>
            <option value="SUPPORTING_DOCUMENT">Supporting document</option>
          </select>
        </label>
        <input accept=".pdf,.png,.jpg,.jpeg" name="file" required type="file" />
        <label className="block text-sm"><input name="confirm" required type="checkbox" /> I confirm this document is intended for this student.</label>
        <button className="rounded bg-blue-700 px-3 py-2 text-white" type="submit">Upload document</button>
        {uploadState.error && <p className="text-sm text-red-700">{uploadState.error}</p>}
        {uploadState.success && <p className="text-sm text-green-700">{uploadState.success}</p>}
      </form>
    </section>
  );
}
