import { NextRequest } from "next/server";
import { handler, json } from "@/server/http";
import { adminContext } from "@/server/admin";
import { MENU_CATEGORIES } from "@/lib/categories";

export const dynamic = "force-dynamic";

/** Menu sections are the shared `Category` enum (same as the website), with item counts. */
export const GET = handler(async (req: NextRequest) => {
  const { db } = await adminContext(req);
  const counts = await db.menuItem.groupBy({ by: ["category"], where: { active: true }, _count: { _all: true } });
  return json({
    categories: MENU_CATEGORIES.map((c) => ({
      ...c,
      active: true,
      itemCount: counts.find((x) => x.category === c.id)?._count._all ?? 0,
    })),
  });
});
