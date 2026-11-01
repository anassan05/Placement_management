import { test, expect } from "@playwright/test";

test("home page renders the CampusConnect foundation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", {
    name: "Better connections. Stronger first steps."
  })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
});

test("landing navigation reaches the platform and foundation sections", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Platform" }).click();
  await expect(page).toHaveURL(/#platform$/);
  await expect(page.getByRole("heading", { name: "Built to bring the placement journey together." })).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Foundation" }).click();
  await expect(page).toHaveURL(/#foundation$/);
  await expect(page.getByText("A space for each college")).toBeVisible();
});

test("landing page fits a narrow viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("landing page produces no browser console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Better connections. Stronger first steps." })).toBeVisible();
  expect(errors).toEqual([]);
});

test("health endpoint returns ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).status).toBe("ok");
});

test("college application page renders accessible core fields", async ({ page }) => {
  await page.goto("/apply-college");
  await expect(page.getByRole("heading", { name: "Apply to onboard your college" })).toBeVisible();
  await expect(page.getByLabel("College name")).toBeVisible();
  await expect(page.getByLabel("Administrator email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit application" })).toBeVisible();
});

test("college administrator login route renders", async ({ page }) => {
  await page.goto("/college/login");
  await expect(page.getByRole("heading", { name: "College administrator sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("application form remains usable on mobile and renders its error state", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/apply-college?error=submit");
  await expect(page.getByText("We could not submit this application. Check the form or try again later.")).toBeVisible();
  await expect(page.getByLabel("College name")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
