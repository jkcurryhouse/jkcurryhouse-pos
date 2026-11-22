import "server-only";
import { NextRequest } from "next/server";
import { requireStaff, Role, SessionStaff } from "./auth";
import { badRequest, clientIp } from "./http";
import { writeAudit } from "./audit";
import { getDb } from "@/db";

export const TZ = "Europe/London";

export async function adminContext(req: NextRequest, min: Role = "manager") {
  const staff = await requireStaff(min);
  const db = getDb();
  const ip = clientIp(req);
  const audit = (type: string, reason: string, meta?: Record<string, unknown>) =>
    writeAudit(db, { type, reason, performedByStaffId: staff.id, meta, ip });
  return { staff, db, ip, audit };
}
export type AdminCtx = { staff: SessionStaff };

/** Parse a YYYY-MM-DD (London local) date range; defaults to the last 30 days. */
export function dateRange(req: NextRequest, defaultDays = 30) {
  const sp = req.nextUrl.searchParams;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const to = sp.get("to") || today;
  const fromDefault = new Date(Date.now() - (defaultDays - 1) * 86400000).toLocaleDateString("en-CA", { timeZone: TZ });
  const from = sp.get("from") || fromDefault;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw badRequest("Dates must be YYYY-MM-DD");
  }
  return { from, to };
}

export function page(req: NextRequest, max = 200) {
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(max, Math.max(1, Number(sp.get("limit") ?? 50)));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0));
  return { limit, offset };
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const v = c == null ? "" : String(c);
          // guard against CSV formula injection when opened in Excel
          const safe = /^[=+\-@]/.test(v) && isNaN(Number(v)) ? `'${v}` : v;
          return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(",")
    )
    .join("\n");
}
