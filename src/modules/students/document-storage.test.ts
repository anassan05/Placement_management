import { beforeAll, describe, expect, it } from "vitest";

let storage: typeof import("./document-storage");

describe("private document storage", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = "postgresql://test";
    process.env.APP_DATABASE_URL = "postgresql://test";
    storage = await import("./document-storage");
  });

  it("writes documents under a random non-public key and reads the same bytes", async () => {
    const bytes = new TextEncoder().encode("%PDF-test");
    const stored = await storage.writePrivateDocument(bytes, "pdf");
    try {
      expect(stored.storageKey).toMatch(/^documents\/[0-9a-f-]{36}\.pdf$/);
      expect(stored.sha256).toHaveLength(64);
      expect(await storage.readPrivateDocument(stored.storageKey)).toEqual(Buffer.from(bytes));
    } finally {
      await storage.deletePrivateDocument(stored.storageKey);
    }
  });

  it("rejects traversal and non-random storage keys", async () => {
    await expect(storage.readPrivateDocument("../.env")).rejects.toThrow("Invalid private storage key");
    await expect(storage.readPrivateDocument("documents/not-a-uuid.pdf")).rejects.toThrow("Invalid private storage key");
  });
});
