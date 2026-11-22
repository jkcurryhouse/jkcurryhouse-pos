import { z } from "zod";
import { CATEGORY_IDS } from "@/lib/categories";

export const ALLERGENS = ["gluten", "dairy", "nuts", "peanuts", "shellfish", "fish", "egg", "soy", "mustard", "sesame", "sulphites", "celery", "lupin", "molluscs"] as const;

export const modifierGroupSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  required: z.boolean(),
  multiSelect: z.boolean(),
  options: z
    .array(z.object({ id: z.string().trim().min(1).max(40), label: z.string().trim().min(1).max(60), priceDelta: z.number().min(-100).max(100) }))
    .min(1)
    .max(30),
});

export const menuItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).default(""),
  price: z.number().min(0).max(1000),
  categoryId: z.enum(CATEGORY_IDS),
  allergens: z.array(z.enum(ALLERGENS)).default([]),
  dietary: z.array(z.string().max(30)).max(10).default([]),
  spiceLevelOptions: z.array(z.enum(["mild", "medium", "hot", "extra-hot"])).default([]),
  modifierGroups: z.array(modifierGroupSchema).max(10).default([]),
  isTodaysSpecial: z.boolean().default(false),
  isOutOfStock: z.boolean().default(false),
  availablePos: z.boolean().default(true),
  availableOnline: z.boolean().default(true),
  imageUrl: z.string().url().max(500).nullable().optional(),
  calories: z.number().int().min(0).max(10000).nullable().optional(),
  vatRatePercent: z.number().min(0).max(100).nullable().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});
export type MenuItemInput = z.infer<typeof menuItemSchema>;

type Cat = "STARTER" | "MAIN" | "SIDE" | "RICE" | "BREAD" | "SPECIAL" | "DRINK" | "DESSERT";

/** Maps admin form fields (POS naming) onto the shared MenuItem columns (website naming). */
export function menuItemColumns(b: Partial<MenuItemInput>, sent: (k: string) => boolean) {
  const d: Record<string, unknown> = {};
  const direct = ["name", "description", "price", "allergens", "dietary", "spiceLevelOptions", "availablePos", "availableOnline", "calories", "sortOrder", "active", "imageUrl"] as const;
  for (const k of direct) if (sent(k)) d[k] = b[k] ?? null;
  if (sent("categoryId")) d.category = b.categoryId as Cat;
  if (sent("isTodaysSpecial")) d.isSpecial = !!b.isTodaysSpecial;
  if (sent("isOutOfStock")) d.isAvailable = !b.isOutOfStock;
  if (sent("modifierGroups")) d.modifierGroups = b.modifierGroups ?? [];
  if (sent("vatRatePercent")) d.vatRateBasisPoints = b.vatRatePercent != null ? Math.round(b.vatRatePercent * 100) : null;
  if (sent("description") && d.description == null) d.description = "";
  return d;
}
