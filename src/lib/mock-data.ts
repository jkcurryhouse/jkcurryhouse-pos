// Constants shared by the POS UI and the seed script. The menu itself lives in the
// database (seeded from prisma/seed-menu.ts, the restaurant's real menu).
import { PromoCode } from "./types";

// Single-location today, but POS records carry this so multi-site is a config change.
export const RESTAURANT_ID = "anand-main";

/** Starter promo codes, created by the seed only if they don't exist yet. */
export const promoCodes: PromoCode[] = [
  { code: "WELCOME10", label: "Welcome 10% off", percentOff: 10 },
  { code: "FAMILY15", label: "Family meal 15% off", percentOff: 15 },
];

/** The 14 UK regulated allergens. Keys match the website (`soy`, not `soya`). */
export const allergenLabels: Record<string, string> = {
  gluten: "Gluten",
  dairy: "Dairy",
  nuts: "Nuts",
  peanuts: "Peanuts",
  shellfish: "Shellfish",
  fish: "Fish",
  egg: "Egg",
  soy: "Soy",
  mustard: "Mustard",
  sesame: "Sesame",
  sulphites: "Sulphites",
  celery: "Celery",
  lupin: "Lupin",
  molluscs: "Molluscs",
};
