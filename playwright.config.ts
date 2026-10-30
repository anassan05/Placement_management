import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

const testAdminUrl = process.env.TEST_ADMIN_DATABASE_URL ?? derive(process.env.DATABASE_URL, "campusconnect_test");
const testRuntimeUrl = process.env.TEST_DATABASE_URL ?? derive(process.env.APP_DATABASE_URL, "campusconnect_test");
if (!testAdminUrl || !testRuntimeUrl) throw new Error("Configure database URLs before browser tests.");
if (new URL(testAdminUrl).pathname.replace(/^\//, "") !== "campusconnect_test" || new URL(testRuntimeUrl).pathname.replace(/^\//, "") !== "campusconnect_test") {
  throw new Error("Playwright database URLs must target campusconnect_test.");
}
process.env.TEST_ADMIN_DATABASE_URL = testAdminUrl;
process.env.TEST_DATABASE_URL = testRuntimeUrl;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "off",
    screenshot: "off",
    video: "off"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    env: {
      ...process.env,
      DATABASE_URL: testAdminUrl,
      APP_DATABASE_URL: testRuntimeUrl,
      APP_URL: "http://127.0.0.1:3000",
      NODE_ENV: "development"
    },
    timeout: 120_000
  }
});

function derive(source: string | undefined, database: string): string | undefined {
  if (!source) return undefined;
  const url = new URL(source);
  url.pathname = `/${database}`;
  return url.toString();
}
