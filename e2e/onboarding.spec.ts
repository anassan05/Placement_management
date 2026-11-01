import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

test.setTimeout(60_000);

test("platform onboarding and Phase 2B staff lifecycle stay tenant scoped", async ({ page, browser }) => {
  page.setDefaultTimeout(15_000);
  const fixturePath = resolve("test-results", ".e2e-fixture.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as { marker: string; email: string; password: string; staffAcceptKeyHashes?: string[] };
  const { marker, email: platformEmail, password: platformPassword } = fixture;
  if (!marker || !platformEmail || !platformPassword) throw new Error("Isolated E2E fixtures were not initialized.");
  const collegeName = `E2E Synthetic College ${marker}`;
  const contactEmail = `college-contact-e2e-${marker}@example.invalid`;
  const administratorEmail = `college-admin-e2e-${marker}@example.invalid`;
  const administratorPassword = `${marker}-College-E2E-Password-Only`;

  await page.goto("/platform/login");
  await page.getByLabel("Email").fill(platformEmail);
  await page.getByLabel("Password").fill(platformPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/platform\/dashboard$/, { timeout: 15_000 });

  await page.goto("/apply-college");
  await page.getByLabel("College name").fill(collegeName);
  await page.getByLabel("Short name").fill(`E2E ${marker}`);
  await page.getByLabel("College contact email").fill(contactEmail);
  await page.getByLabel("College contact phone").fill("+1 555 010 4444");
  await page.getByLabel("State").fill("Synthetic State");
  await page.getByLabel("District").fill("Synthetic District");
  await page.getByLabel("Address").fill("100 E2E Test Road, Synthetic District");
  await page.getByLabel("Administrator name").fill("Synthetic E2E Administrator");
  await page.getByLabel("Administrator email").fill(administratorEmail);
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("status")).toContainText("Application received");

  await page.goto("/platform/applications");
  await page.getByRole("link", { name: new RegExp(collegeName) }).click();
  await expect(page.getByRole("heading", { name: collegeName })).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Approve and issue invitation" }).click();
  const invitation = page.getByLabel("One-time invitation URL");
  await expect(invitation).toBeVisible();
  const invitationUrl = await invitation.inputValue();

  await page.goto(invitationUrl);
  await expect(page.getByRole("heading", { name: "Activate your college administrator account" })).toBeVisible();
  await page.getByLabel("Administrator name").fill("Synthetic E2E Administrator");
  await page.getByLabel("Password (12 or more characters)").fill(administratorPassword);
  await page.getByRole("button", { name: "Create account and activate college" }).click();
  await expect(page).toHaveURL(/\/college\/dashboard$/);
  await expect(page.getByRole("heading", { name: collegeName })).toBeVisible();
  await expect(page.getByText("COLLEGE_ADMIN · ACTIVE")).toBeVisible();

  await page.goto("/college/departments");
  await page.getByLabel("Department name").fill("Computer Science");
  await page.getByLabel("Short code").fill("CSE");
  await page.getByRole("button", { name: "Create department" }).click();
  await expect(page.getByText("CSE")).toBeVisible();
  await page.getByLabel("Department name").fill("Electronics");
  await page.getByLabel("Short code").fill("ECE");
  await page.getByRole("button", { name: "Create department" }).click();
  await expect(page.getByText("ECE")).toBeVisible();
  await page.getByLabel("Department name").fill("Mechanical");
  await page.getByLabel("Short code").fill("ME");
  await page.getByRole("button", { name: "Create department" }).click();

  const officerEmail = `placement-officer-e2e-${marker}@example.invalid`;
  const staffPassword = `${marker}-Staff-E2E-Password-Only`;
  await page.goto("/college/staff/invite");
  await page.getByLabel("Full name").fill("Synthetic Placement Officer");
  await page.getByLabel("Official email").fill(officerEmail);
  await page.getByRole("button", { name: "Generate invitation link" }).click();
  const officerLink = page.getByLabel("One-time staff invitation URL");
  await expect(officerLink).toBeVisible();
  const officerInvite = await officerLink.inputValue();
  recordAcceptanceRateKey(new URL(officerInvite).pathname.split("/").at(-1)!);
  const officerContext = await browser.newContext();
  const officerPage = await officerContext.newPage();
  await officerPage.goto(officerInvite);
  await officerPage.getByLabel("Password (12 or more characters)").fill(staffPassword);
  await officerPage.getByLabel("Confirm password").fill(staffPassword);
  await officerPage.getByRole("button", { name: "Create account and join college" }).click();
  await expect(officerPage).toHaveURL(/\/college\/placement$/);
  await officerPage.goto("/college/login");
  await officerPage.getByLabel("Email").fill(officerEmail);
  await officerPage.getByLabel("Password").fill(staffPassword);
  await officerPage.getByRole("button", { name: "Sign in" }).click();
  await expect(officerPage).toHaveURL(/\/college\/placement$/);
  await officerPage.goto("/college/staff");
  await expect(officerPage).toHaveURL(/\/college\/login$/);
  await officerContext.close();

  await page.goto("/college/staff");
  await expect(page.getByText(officerEmail)).toBeVisible();
  await page.goto("/college/staff/invite");
  await page.getByLabel("Full name").fill("Synthetic Coordinator");
  const coordinatorEmail = `coordinator-e2e-${marker}@example.invalid`;
  await page.getByLabel("Official email").fill(coordinatorEmail);
  await page.getByLabel("Staff role").selectOption("COORDINATOR");
  await page.getByLabel("Computer Science (CSE)").check();
  await page.getByRole("button", { name: "Generate invitation link" }).click();
  const coordinatorLink = page.getByLabel("One-time staff invitation URL");
  await expect(coordinatorLink).toBeVisible();
  const coordinatorInvite = await coordinatorLink.inputValue();
  recordAcceptanceRateKey(new URL(coordinatorInvite).pathname.split("/").at(-1)!);
  const coordinatorContext = await browser.newContext();
  const coordinatorPage = await coordinatorContext.newPage();
  await coordinatorPage.goto(coordinatorInvite);
  await coordinatorPage.getByLabel("Password (12 or more characters)").fill(staffPassword);
  await coordinatorPage.getByLabel("Confirm password").fill(staffPassword);
  await coordinatorPage.getByRole("button", { name: "Create account and join college" }).click();
  await expect(coordinatorPage).toHaveURL(/\/college\/coordinator$/);
  await expect(coordinatorPage.getByText("Computer Science")).toBeVisible();
  await expect(coordinatorPage.getByText("Electronics")).toHaveCount(0);

  await page.goto("/college/staff");
  await expect(page.getByText(coordinatorEmail)).toBeVisible();
  const coordinatorHref = await page.getByRole("link", { name: "Synthetic Coordinator" }).getAttribute("href");
  expect(coordinatorHref).toBeTruthy();
  await page.goto(coordinatorHref!);
  await expect(page.getByText("Department assignments")).toBeVisible();
  await page.locator("li").filter({ hasText: "Electronics (ECE)" }).getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.locator("li").filter({ hasText: "Electronics (ECE)" }).getByRole("button", { name: "Remove assignment" })).toBeVisible();
  await coordinatorPage.goto("/college/coordinator");
  await expect(coordinatorPage.getByText("Electronics")).toBeVisible();
  await expect(coordinatorPage.getByText("Mechanical")).toHaveCount(0);
  await page.goto("/college/staff");
  const staffRows = page.getByRole("row");
  const coordinatorRow = staffRows.filter({ hasText: coordinatorEmail });
  await coordinatorRow.getByRole("button", { name: "Deactivate" }).click();
  await page.waitForLoadState("networkidle");
  await page.goto("/college/staff");
  await expect(page.getByRole("row").filter({ hasText: coordinatorEmail })).toContainText("Inactive");
  await coordinatorPage.goto("/college/coordinator");
  await expect(coordinatorPage).toHaveURL(/\/college\/login$/);
  await coordinatorContext.close();

  function recordAcceptanceRateKey(token: string) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    fixture.staffAcceptKeyHashes ??= [];
    fixture.staffAcceptKeyHashes.push(createHash("sha256").update(`staff-accept:${tokenHash}`).digest("hex"));
    writeFileSync(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
  }
});
