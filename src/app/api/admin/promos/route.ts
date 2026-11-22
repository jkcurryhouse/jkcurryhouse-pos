import { NextRequest } from "next/server";
import { conflict, handler, json, parseBody } from "@/server/http";
import { adminContext } from "@/server/admin";
import { NO_EXPIRY, promoBody, serializePromo } from "@/server/promoAdmin";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const { db } = await adminContext(req);
  const rows = await db.offer.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] });
  return json({ promos: rows.map(serializePromo) });
});

export const POST = handler(async (req: NextRequest) => {
  const { db, audit } = await adminContext(req);
  const b = await parseBody(req, promoBody);
  const code = b.code.toUpperCase();
  if (await db.offer.findUnique({ where: { code } })) throw conflict("That code already exists");
  const row = await db.offer.create({
    data: {
      code,
      title: b.label,
      description: b.description || b.label,
      discount: b.discount,
      isPercent: b.isPercent,
      isGeneral: true,
      minSpend: b.minSpend,
      validFrom: b.validFrom ? new Date(b.validFrom) : null,
      expiresAt: b.validTo ? new Date(b.validTo) : NO_EXPIRY,
      maxUses: b.maxUses ?? null,
      channels: b.channels,
      active: b.active,
    },
  });
  await audit("promo-change", `Promo ${code} created (${b.isPercent ? `${b.discount}%` : `£${b.discount.toFixed(2)}`} off)`, { promoId: row.id });
  return json({ id: row.id }, { status: 201 });
});
