import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("platform review and one-time invitation activate a college administrator", async ({ page }) => {
  const { marker, email: platformEmail, password: platformPassword } = JSON.parse(readFileSync(resolve("test-results", ".e2e-fixture.json"), "utf8")) as { marker: string; email: string; password: string };
  if (!marker || !platformEmail || !platformPassword) throw new Error("Isolated E2E fixtures were not initialized.");
  const collegeName = `E2E Synthetic College ${marker}`;
  const contactEmail = `college-contact-e2e-${marker}@example.invalid`;
  const administratorEmail = `college-admin-e2e-${marker}@example.invalid`;
  const administratorPassword = `${marker}-College-E2E-Password-Only`;

  await page.goto("/platform/login");
  await page.getByLabel("Email").fill(platformEmail);
  await page.getByLabel("Password").fill(platformPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/platform\/dashboard$/);

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
});
