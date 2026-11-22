import type { MenuCategory } from "./types";

/**
 * Menu sections — the `Category` enum in the shared database. Same order and labels as
 * the website. Adding a section means adding an enum value in prisma/schema.prisma
 * (+ a migration) in both repos.
 */
export const MENU_CATEGORIES: MenuCategory[] = [
  { id: "SPECIAL", name: "Today's Specials", sortOrder: 0 },
  { id: "STARTER", name: "Starters", sortOrder: 10 },
  { id: "MAIN", name: "Main Course", sortOrder: 20 },
  { id: "SIDE", name: "Side Dishes", sortOrder: 30 },
  { id: "RICE", name: "Rice & Biryani", sortOrder: 40 },
  { id: "BREAD", name: "Breads", sortOrder: 50 },
  { id: "DESSERT", name: "Desserts", sortOrder: 60 },
  { id: "DRINK", name: "Drinks & Bar", sortOrder: 70 },
];

export const CATEGORY_IDS = MENU_CATEGORIES.map((c) => c.id) as [string, ...string[]];
export const categoryName = (id: string) => MENU_CATEGORIES.find((c) => c.id === id)?.name ?? id;
