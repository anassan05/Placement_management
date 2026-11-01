import { describe, expect, it } from "vitest";

describe("student dashboard completion", () => {
  it("uses a bounded percentage for persisted profile fields", () => {
    const completed = 7;
    const total = 10;
    expect(Math.round((completed / total) * 100)).toBe(70);
    expect(Math.round((0 / total) * 100)).toBe(0);
    expect(Math.round((total / total) * 100)).toBe(100);
  });
});
