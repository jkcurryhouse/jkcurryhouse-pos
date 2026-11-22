import { NextRequest } from "next/server";
import { Prisma } from "@/db";
import { handler, json, notFound } from "@/server/http";
import { adminContext } from "@/server/admin";
import { NO_EXPIRY, promoBody } from "@/server/promoAdmin";

export const dynamic = "force-dynamic";

export const PATCH = handler(async (req: NextRequest, { params }) => {
  const { db, audit } = await adminContext(req);
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const b = promoBody.partial().parse(raw);
  const data: Prisma.OfferUpdateInput = {};
  if ("label" in raw) data.title = b.label;
  if ("description" in raw) data.description = b.description ?? "";
  if ("discount" in raw) data.discount = b.discount;
  if ("isPercent" in raw) data.isPercent = b.isPercent;
  if ("minSpend" in raw) data.minSpend = b.minSpend ?? 0;
  if ("validFrom" in raw) data.validFrom = b.validFrom ? new Date(b.validFrom) : null;
  if ("validTo" in raw) data.expiresAt = b.validTo ? new Date(b.validTo) : NO_EXPIRY;
  if ("maxUses" in raw) data.maxUses = b.maxUses ?? null;
  if ("channels" in raw) data.channels = b.channels;
  if ("active" in raw) data.active = b.active;
  const row = await db.offer.update({ where: { id: params.id }, data }).catch(() => null);
  if (!row) throw notFound();
  await audit("promo-change", `Promo ${row.code} updated${"active" in raw ? (b.active ? " (enabled)" : " (disabled)") : ""}`, { promoId: row.id });
  return json({ ok: true });
});

export const DELETE = handler(async (req: NextRequest, { params }) => {
  const { db, audit } = await adminContext(req);
  // Disable rather than delete: orders and signed-in customers' unlocked offers reference it.
  const row = await db.offer.update({ where: { id: params.id }, data: { active: false } }).catch(() => null);
  if (!row) throw notFound();
  await audit("promo-change", `Promo ${row.code} disabled`, { promoId: row.id });
  return json({ ok: true });
});
