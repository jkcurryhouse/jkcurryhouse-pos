/**
 * Prepares DATABASE_URL for the node-postgres driver adapter.
 *
 * Removes query parameters that are either handled separately (sslmode → DATABASE_SSL) or only
 * meant for Prisma's old Rust engine (connection_limit, pool_timeout, …). Those would otherwise be
 * misread by `pg`, e.g. `?sslmode=require&connection_limit=5`. Uses the URL parser, so the
 * database name and the remaining parameters stay intact.
 */
const STRIP = ["sslmode", "sslaccept", "sslcert", "sslidentity", "sslpassword", "connection_limit", "pool_timeout", "connect_timeout", "socket_timeout", "pgbouncer", "statement_cache_size", "schema"];

export function cleanDatabaseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of STRIP) u.searchParams.delete(k);
    return u.toString();
  } catch {
    // Not parseable as a URL (unusual characters in the password?) — fall back to string surgery.
    const [base, query = ""] = raw.split("?");
    const kept = query.split("&").filter((p) => p && !STRIP.includes(p.split("=")[0]));
    return kept.length ? `${base}?${kept.join("&")}` : base;
  }
}

/** `connection_limit` from the URL, if someone set one (used as the pool size). */
export function urlConnectionLimit(raw: string): number | undefined {
  const m = raw.match(/[?&]connection_limit=(\d+)/);
  return m ? Number(m[1]) : undefined;
}
