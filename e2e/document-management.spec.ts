import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("authorized document upload, replacement, download and deletion", async ({ page, request }) => {
  const fixture = JSON.parse(readFileSync(resolve("test-results", ".e2e-fixture.json"), "utf8")) as {
    documentAdminEmail: string; documentPassword: string; documentStudentId: string;
  };
  await page.goto("/college/login");
  await page.getByLabel("Email").fill(fixture.documentAdminEmail);
  await page.getByLabel("Password").fill(fixture.documentPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/college\/dashboard$/, { timeout: 15_000 });
  await page.goto(`/college/students/${fixture.documentStudentId}`);

  await page.getByLabel("Category").selectOption("RESUME");
  await page.getByLabel("I confirm this document is intended for this student.").check();
  await page.locator('input[type="file"]').setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-first") });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByText("resume.pdf")).toBeVisible();
  const firstDownload = page.getByRole("link", { name: "resume.pdf" });
  await expect(firstDownload).toHaveAttribute("href", /\/documents\//);

  await page.getByLabel("I confirm this document is intended for this student.").check();
  await page.locator('input[type="file"]').setInputFiles({ name: "updated.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-updated") });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByText("updated.pdf")).toBeVisible();
  await expect(page.getByText("resume.pdf")).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "updated.pdf" }).click();
  const download = await downloadPromise;
  expect(await download.createReadStream()).toBeTruthy();

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("updated.pdf")).toHaveCount(0);
  expect((await request.get(`/api/college/students/${fixture.documentStudentId}/documents/not-a-document`)).status()).toBe(401);
});

test("rejects invalid document signatures in the browser", async ({ page }) => {
  const fixture = JSON.parse(readFileSync(resolve("test-results", ".e2e-fixture.json"), "utf8")) as {
    documentAdminEmail: string; documentPassword: string; documentStudentId: string;
  };
  await page.goto("/college/login");
  await page.getByLabel("Email").fill(fixture.documentAdminEmail);
  await page.getByLabel("Password").fill(fixture.documentPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/college\/dashboard$/, { timeout: 15_000 });
  await page.goto(`/college/students/${fixture.documentStudentId}`);
  await page.getByLabel("I confirm this document is intended for this student.").check();
  await page.locator('input[type="file"]').setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a PDF") });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByText(/could not be uploaded/i)).toBeVisible();
  await expect(page.getByText("fake.pdf")).toHaveCount(0);
});

test("rejects an oversized document in the browser", async ({ page }) => {
  const fixture = JSON.parse(readFileSync(resolve("test-results", ".e2e-fixture.json"), "utf8")) as {
    documentAdminEmail: string; documentPassword: string; documentStudentId: string;
  };
  await page.goto("/college/login");
  await page.getByLabel("Email").fill(fixture.documentAdminEmail);
  await page.getByLabel("Password").fill(fixture.documentPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/college\/dashboard$/, { timeout: 15_000 });
  await page.goto(`/college/students/${fixture.documentStudentId}`);
  await page.getByLabel("I confirm this document is intended for this student.").check();
  await page.locator('input[type="file"]').setInputFiles({
    name: "oversized.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(10 * 1024 * 1024 + 1)])
  });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByText(/could not be uploaded/i)).toBeVisible();
});
