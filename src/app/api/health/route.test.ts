import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("health endpoint", () => {
  it("returns HTTP 200 with the service status", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", service: "campusconnect-web" });
  });
});
