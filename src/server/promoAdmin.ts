import { z } from "zod";
import type { Offer } from "@/generated/prisma/client";

/** Promo codes are the website's Offer table. POS-created codes are "general" (anyone can use them). */
export function serializePromo(p: Offer) {
  return {
    id: p.id,
    code: p.code,
    label: p.title,
    description: p.description,
    percentOff: p.isPercent ? p.discount : 0,
    amountOff: p.isPercent ? 0 : p.discount,
    isPercent: p.isPercent,
    isGeneral: p.isGeneral,
    minOrders: p.minOrders,
    minSpend: p.minSpend,
    validFrom: p.validFrom?.getTime() ?? null,
    validTo: p.expiresAt.getTime() >= NO_EXPIRY.getTime() ? null : p.expiresAt.getTime(),
    maxUses: p.maxUses,
    useCount: p.useCount,
    channels: p.channels,
    active: p.active,
  };
}

/** The website requires an expiry date; "no expiry" is stored as the end of 2099. */
export const NO_EXPIRY = new Date("2099-12-31T23:59:59Z");

export const promoBody = z.object({
  code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only"),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
  isPercent: z.boolean().default(true),
  /** % off when isPercent, otherwise £ off */
  discount: z.number().gt(0).max(1000),
  minSpend: z.number().min(0).max(10000).default(0),
  validFrom: z.number().int().nullable().optional(),
  validTo: z.number().int().nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  channels: z.array(z.enum(["POS", "online"])).min(1).default(["POS", "online"]),
  active: z.boolean().default(true),
}).refine((b) => !b.isPercent || b.discount <= 100, { message: "A percentage can't be over 100", path: ["discount"] });
