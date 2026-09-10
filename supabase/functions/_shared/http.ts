import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { applyCors, preflightResponse } from "./cors.ts";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** OPTIONS must reach the worker (gateway JWT off). Auth stays in requireUser(). */
export function serveWithCors(handler: (req: Request) => Promise<Response> | Response): void {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return preflightResponse(req);
    }
    return applyCors(req, await handler(req));
  });
}

function firstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = Deno.env.get(key);
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function firstJsonSecret(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return trimmed;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.find((value): value is string => typeof value === "string" && value.length > 0);
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      for (const key of ["anon", "publishable", "default", "service_role", "secret"]) {
        const value = record[key];
        if (typeof value === "string" && value.length > 0) return value;
      }
      const first = Object.values(record).find(
        (value): value is string => typeof value === "string" && value.length > 0,
      );
      return first;
    }
  } catch {
    return trimmed;
  }
  return undefined;
}

function getAnonKey(): string | undefined {
  return (
    firstEnv("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY") ??
    firstJsonSecret(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"))
  );
}

function getServiceRoleKey(): string | undefined {
  return (
    firstEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY") ??
    firstJsonSecret(Deno.env.get("SUPABASE_SECRET_KEYS"))
  );
}

export function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = getServiceRoleKey();
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) {
    return { error: json({ error: "Missing Authorization" }, 401) };
  }
  const url = Deno.env.get("SUPABASE_URL");
  const anon = getAnonKey();
  if (!url || !anon) {
    return { error: json({ error: "Server misconfigured" }, 500) };
  }
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    return { error: json({ error: "Unauthorized" }, 401) };
  }
  return { user: data.user, userClient };
}
