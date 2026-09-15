import { describe, expect, it } from "vitest";
import { withGeminiRetries, classifyGeminiProviderError } from "./retry";

describe("retry module unit", () => {
  it("does not retry non-rate-limit errors", async () => {
    let calls = 0;
    await expect(
      withGeminiRetries(async () => {
        calls += 1;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);
    expect(classifyGeminiProviderError(new Error("boom")).isRateLimited).toBe(false);
  });
});
