import { describe, expect, it } from "vitest";
import { applyCors, corsHeaders, preflightResponse } from "./cors";

describe("corsHeaders", () => {
  it("reflects the browser Origin so Vercel preflight can succeed", () => {
    const headers = corsHeaders("https://fitness-auto-pilot.vercel.app", "authorization, apikey, content-type");
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://fitness-auto-pilot.vercel.app");
    expect(headers["Access-Control-Allow-Headers"]).toBe("authorization, apikey, content-type");
    expect(headers["Access-Control-Allow-Methods"]).toContain("OPTIONS");
    expect(headers.Vary).toBe("Origin");
  });

  it("falls back to * and default headers when Origin is absent", () => {
    const headers = corsHeaders(null, null);
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers["Access-Control-Allow-Headers"]).toContain("authorization");
    expect(headers["Access-Control-Allow-Headers"]).toContain("apikey");
    expect(headers.Vary).toBeUndefined();
  });
});

describe("preflightResponse", () => {
  it("returns 204 with CORS headers for OPTIONS", () => {
    const response = preflightResponse(
      new Request("https://izskiyiwoecvgkffylib.supabase.co/functions/v1/complete-rmr-onboarding", {
        method: "OPTIONS",
        headers: {
          Origin: "https://fitness-auto-pilot.vercel.app",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, x-client-info, apikey, content-type",
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://fitness-auto-pilot.vercel.app",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("authorization");
  });
});

describe("applyCors", () => {
  it("adds CORS headers to JSON error responses", () => {
    const req = new Request("https://example.supabase.co/functions/v1/complete-rmr-onboarding", {
      method: "POST",
      headers: { Origin: "https://fitness-auto-pilot.vercel.app" },
    });
    const response = applyCors(
      req,
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://fitness-auto-pilot.vercel.app",
    );
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });
});
