import { NextResponse, type NextRequest } from "next/server";
import { isIP } from "node:net";

/**
 * Kalchas runs on the person's own machine, with their key and no sign-in, so whatever can reach it can read their
 * projects and spend. A web page open in the same browser can reach it too; these requests are turned away:
 * - addressed to a name that is not this machine. A site can point its own name at 127.0.0.1 and then read the answers
 *   as its own (DNS rebinding). This machine is `localhost` or an address; another name it is served under is listed in
 *   KALCHAS_ALLOWED_HOSTS (comma-separated).
 * - from another site, to the API: the browser says where a request comes from (Sec-Fetch-Site).
 * - from another origin, changing anything: the Origin the browser sends with it is not this one. A browser sends it
 *   even when it does not say where a request comes from.
 * The command line and scripts send neither header and are let through.
 */

const named = (process.env.KALCHAS_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(`http://${value}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return null;
  }
}

const thisMachine = (host: string) => host === "localhost" || host.endsWith(".localhost") || isIP(host) !== 0 || named.includes(host);

const refuse = (why: string) => NextResponse.json({ error: why }, { status: 403 });

export function proxy(req: NextRequest) {
  const host = req.headers.get("host");
  const name = hostOf(host);
  if (!name || !thisMachine(name)) return refuse(`Kalchas answers only on this machine (not ${name ?? "an unnamed host"}); add the name to KALCHAS_ALLOWED_HOSTS to serve it there`);

  const site = req.headers.get("sec-fetch-site");
  if (req.nextUrl.pathname.startsWith("/api/") && site && site !== "same-origin" && site !== "none") return refuse("Kalchas's API takes requests only from its own pages");

  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin !== null) {
      let from: string | null = null;
      try {
        from = new URL(origin).host.toLowerCase();
      } catch {}
      if (from !== host?.toLowerCase()) return refuse("Kalchas takes changes only from its own pages");
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
