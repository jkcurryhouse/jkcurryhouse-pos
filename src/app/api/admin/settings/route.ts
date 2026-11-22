import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@/db";
import { badRequest, clientIp, handler, json, notFound, parseBody } from "@/server/http";
import type { Db } from "@/db";
import { adminContext } from "@/server/admin";
import { RESTAURANT_ID } from "@/server/ops";
import { serializeSettings } from "@/server/serialize";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const { db } = await adminContext(req, "manager");
  const row = await db.restaurant.findUnique({ where: { id: RESTAURANT_ID } });
  if (!row) throw notFound("Restaurant settings missing — run npm run db:seed");
  const allowlist = (process.env.POS_ALLOWED_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return json({
    settings: serializeSettings(row),
    nextOrderNumber: await nextOrderNumber(db),
    network: { yourIp: clientIp(req), allowlist, enforced: allowlist.length > 0 },
    environment: {
      demoTools: process.env.ENABLE_DEMO_TOOLS === "true",
      databaseSsl: (process.env.DATABASE_SSL ?? "require").toLowerCase(),
      orm: "Prisma 7 (PostgreSQL driver adapter)",
    },
  });
});

const body = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  legalName: z.string().trim().max(120).optional(),
  tagline: z.string().trim().max(120).optional(),
  addressLines: z.array(z.string().trim().max(120)).max(6).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
  vatNumber: z.string().trim().max(20).optional(),
  companyNumber: z.string().trim().max(20).optional(),
  receiptFooter: z.string().trim().max(300).optional(),
  vatRatePercent: z.number().min(0).max(100).optional(),
  defaultServiceChargePercent: z.number().min(0).max(25).optional(),
  serviceChargeMinGuests: z.number().int().min(0).max(100).optional(),
  inactivityLogoutMinutes: z.number().int().min(1).max(240).optional(),
  autoSendToKitchen: z.boolean().optional(),
  kdsWarnMinutes: z.number().int().min(1).max(180).optional(),
  tipPresets: z.array(z.number().int().min(0).max(50)).max(5).optional(),
  nextOrderNumber: z.number().int().min(1).optional(),
});

export const PATCH = handler(async (req: NextRequest) => {
  const { db, audit } = await adminContext(req, "admin");
  const b = await parseBody(req, body);
  const { vatRatePercent, addressLines, nextOrderNumber: wantNext, ...rest } = b;
  if (wantNext !== undefined) {
    // Shared with the website: order numbers come from one Postgres sequence.
    const [{ max }] = await db.$queryRaw<{ max: number | null }[]>`select max("orderNumber") as max from "Order"`;
    if (max != null && wantNext <= max) throw badRequest(`Next order number must be above ${max}, the highest used so far`);
    await db.$executeRaw`select setval(pg_get_serial_sequence('"Order"', 'orderNumber'), ${wantNext}::bigint, false)`;
  }
  const set: Prisma.RestaurantUpdateInput = { ...rest };
  if (vatRatePercent !== undefined) set.vatRateBasisPoints = Math.round(vatRatePercent * 100);
  if (addressLines) set.addressLines = addressLines.filter(Boolean);
  await db.restaurant.update({ where: { id: RESTAURANT_ID }, data: set });
  await audit("settings-change", `Settings updated: ${Object.keys(b).join(", ")}`, b as Record<string, unknown>);
  return json({ ok: true });
});

async function nextOrderNumber(db: Db) {
  const [r] = await db.$queryRaw<{ last_value: bigint; is_called: boolean }[]>`select last_value, is_called from "Order_orderNumber_seq"`;
  return Number(r.last_value) + (r.is_called ? 1 : 0);
}
