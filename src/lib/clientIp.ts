/**
 * Resolve the real client IP behind Amplify Hosting (CloudFront → compute).
 *
 * Clients can send their own X-Forwarded-For, so the *leftmost* entry is untrustworthy.
 * CloudFront appends the address it actually saw, so we:
 *  1. use CloudFront-Viewer-Address when present ("ip:port"), else
 *  2. take the X-Forwarded-For entry POS_TRUSTED_PROXY_HOPS places from the right
 *     (default 0 = the rightmost, i.e. the one CloudFront appended).
 * The 403 page and Admin → Settings show the detected address, so you can confirm it.
 */
export function resolveClientIp(headers: Headers, fallback = ""): string {
  const viewer = headers.get("cloudfront-viewer-address");
  if (viewer) {
    // IPv4 "1.2.3.4:5678" or IPv6 "2001:db8::1:5678" — strip the trailing port
    const i = viewer.lastIndexOf(":");
    return i > 0 ? viewer.slice(0, i) : viewer;
  }
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const hops = Math.max(0, Number(process.env.POS_TRUSTED_PROXY_HOPS ?? 0) || 0);
    const pick = parts[Math.max(0, parts.length - 1 - hops)];
    if (pick) return pick;
  }
  return headers.get("x-real-ip") ?? fallback;
}
