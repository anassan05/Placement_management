import { describe, expect, it } from "vitest";
import { z } from "zod";
import { RequestValidationError } from "./errors";
import { validateJsonBody } from "./request-validation";

describe("JSON request validation", () => {
  const schema = z.object({ title: z.string().min(1) });

  it("returns parsed values for a valid payload", async () => {
    await expect(validateJsonBody(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ title: "Drive" })
    }), schema)).resolves.toEqual({ title: "Drive" });
  });

  it("rejects invalid data and malformed JSON with a safe 400 error", async () => {
    await expect(validateJsonBody(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ title: "" })
    }), schema)).rejects.toBeInstanceOf(RequestValidationError);
    await expect(validateJsonBody(new Request("http://localhost", {
      method: "POST", body: "{"
    }), schema)).rejects.toBeInstanceOf(RequestValidationError);
  });
});
