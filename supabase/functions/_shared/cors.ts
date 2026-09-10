const DEFAULT_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type";

/** Browser CORS is not the auth boundary. JWT verification stays in `requireUser()`. */
export function corsHeaders(
  origin: string | null,
  requestHeaders: string | null,
): Record<string, string> {
  const allowHeaders =
    requestHeaders && requestHeaders.trim().length > 0
      ? requestHeaders
      : DEFAULT_ALLOW_HEADERS;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin && origin.length > 0 ? origin : "*",
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  if (origin) {
    headers.Vary = "Origin";
  }
  return headers;
}

export function preflightResponse(req: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(
      req.headers.get("Origin"),
      req.headers.get("Access-Control-Request-Headers"),
    ),
  });
}

export function applyCors(req: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(
    corsHeaders(req.headers.get("Origin"), req.headers.get("Access-Control-Request-Headers")),
  )) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
