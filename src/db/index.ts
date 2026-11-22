import "server-only";
import fs from "node:fs";
import type { PoolConfig } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";

/**
 * TLS for RDS. The stack forces SSL (rds.force_ssl=1), so:
 *   DATABASE_SSL=verify  -> verify the server cert against the Amazon RDS CA bundle
 *                           (DATABASE_SSL_CA = PEM text, or certs/rds-global-bundle.pem)
 *   DATABASE_SSL=require -> encrypted, without CA verification (default)
 *   DATABASE_SSL=disable -> local development only
 */
export function sslConfig(): PoolConfig["ssl"] {
  const mode = (process.env.DATABASE_SSL ?? "require").toLowerCase();
  if (mode === "disable") return false;
  if (mode === "verify") {
    let ca = process.env.DATABASE_SSL_CA;
    if (!ca) {
      const file = `${process.cwd()}/certs/rds-global-bundle.pem`;
      if (fs.existsSync(file)) ca = fs.readFileSync(file, "utf8");
    }
    if (!ca) throw new Error("DATABASE_SSL=verify but no RDS CA bundle was provided");
    return { rejectUnauthorized: true, ca };
  }
  return { rejectUnauthorized: false };
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({
    // sslmode in the URL would override the ssl object below, so strip it here
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, ""),
    ssl: sslConfig(),
    // Amplify's SSR runtime is Lambda-based: keep each instance's pool small so many warm
    // instances don't exhaust RDS max_connections.
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
  return new PrismaClient({ adapter, log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"] });
}

export type Db = ReturnType<typeof createClient>;
/** Interactive-transaction client */
export type Tx = Prisma.TransactionClient;

const globalForDb = globalThis as unknown as { __jkPrisma?: Db };

export function getDb(): Db {
  if (!globalForDb.__jkPrisma) globalForDb.__jkPrisma = createClient();
  return globalForDb.__jkPrisma;
}

export { Prisma };
