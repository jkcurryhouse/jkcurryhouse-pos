import { NextRequest, NextResponse } from "next/server";
import { resolveClientIp } from "@/lib/clientIp";

/**
 * Restaurant-network allow-list (requirement: POS usable only on-site).
 *
 * POS_ALLOWED_IPS is a comma-separated list of IPv4 addresses / CIDR ranges and exact
 * IPv6 addresses, e.g. "81.2.69.160/29, 2a00:23c5:1234::1". Empty = allow all, which
 * is only intended for local development (a warning header is added).
 *
 * Note: the env var is read at build time on Amplify, so redeploy after changing it.
 * For defence in depth also attach an AWS WAF IP-set rule to the Amplify app.
 */
const RAW = process.env.POS_ALLOWED_IPS ?? "";

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function matches(ip: string, rule: string): boolean {
  const clean = ip.replace(/^::ffff:/, "");
  if (!rule.includes("/")) return clean === rule || ip === rule;
  const [base, bitsStr] = rule.split("/");
  const bits = Number(bitsStr);
  const a = ipv4ToInt(clean);
  const b = ipv4ToInt(base);
  if (a === null || b === null || !(bits >= 0 && bits <= 32)) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

function clientIp(req: NextRequest) {
  return resolveClientIp(req.headers, req.ip ?? "");
}

export function middleware(req: NextRequest) {
  const rules = RAW.split(",").map((s) => s.trim()).filter(Boolean);
  if (rules.length === 0) {
    const res = NextResponse.next();
    res.headers.set("x-pos-allowlist", "disabled");
    return res;
  }
  const ip = clientIp(req);
  if (ip && rules.some((r) => matches(ip, r))) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "This device isn't on the restaurant network", code: "network_blocked" },
      { status: 403 }
    );
  }
  return new NextResponse(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Access blocked</title></head>
<body style="font-family:system-ui;background:#16130E;color:#F7F1E6;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;margin:0">
<div style="max-width:360px;padding:24px"><h1 style="font-weight:600">Access blocked</h1>
<p style="opacity:.65">This device isn't on JK Curryhouse's approved restaurant network. Connect to the staff Wi-Fi and reload, or ask a manager to check the network allow-list.</p>
<p style="opacity:.35;font-size:12px">Your address: ${ip.replace(/[^0-9a-fA-F:.]/g, "")}</p></div></body></html>`,
    { status: 403, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-|apple-icon|manifest.json).*)"],
};
