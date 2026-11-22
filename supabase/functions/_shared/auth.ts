// Shared helpers for the Edge Functions. No secrets here.
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://amv-00.github.io,http://localhost:8080").split(",");

export function cors(req: Request) {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.includes(o) ? o : ALLOWED[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-warm",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

/** The gateway (verify_jwt = true) already checked the signature; we additionally require a signed-in user (not the anon key). */
export function userFromJwt(req: Request): { sub: string } | null {
  const tok = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    const p = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.role === "authenticated" && p.sub ? { sub: p.sub } : null;
  } catch { return null; }
}
