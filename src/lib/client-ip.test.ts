import { describe, expect, it } from "vitest";
import { getClientIp } from "./client-ip";

describe("client IP resolution", () => {
  it("ignores spoofed forwarded headers when no trusted proxies are configured", () => {
    const headers = new Headers({ "x-forwarded-for": "10.0.0.1", "x-real-ip": "192.168.1.5" });
    expect(getClientIp(headers)).toBe("192.168.1.5");
  });

  it("returns unknown when no direct IP is available", () => {
    const headers = new Headers({ "x-forwarded-for": "10.0.0.1" });
    expect(getClientIp(headers)).toBe("unknown");
  });

  it("uses the rightmost forwarded value only for trusted proxies", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(getClientIp(headers, ["10.0.0.1"])).toBe("10.0.0.1");
  });
});
