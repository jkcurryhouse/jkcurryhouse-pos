import { NextRequest } from "next/server";
import { Prisma } from "@/db";
import { handler, json } from "@/server/http";
import { adminContext, slugify } from "@/server/admin";
import { menuItemColumns, menuItemSchema } from "@/server/menuSchema";
import { serializeMenuItem } from "@/server/serialize";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const { db } = await adminContext(req);
  const rows = await db.menuItem.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return json({ items: rows.map(serializeMenuItem) });
});

export const POST = handler(async (req: NextRequest) => {
  const { db, audit } = await adminContext(req);
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const b = menuItemSchema.parse(raw);
  let id = slugify(b.name) || `item-${Date.now()}`;
  if (await db.menuItem.findUnique({ where: { id }, select: { id: true } })) id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
  const max = await db.menuItem.aggregate({ _max: { sortOrder: true }, where: { category: b.categoryId as never } });
  const data = menuItemColumns(b, () => true) as Prisma.MenuItemUncheckedCreateInput;
  await db.menuItem.create({ data: { ...data, id, sortOrder: b.sortOrder ?? (max._max.sortOrder ?? 0) + 10 } });
  await audit("menu-change", `Menu item "${b.name}" created at £${b.price.toFixed(2)}`, { itemId: id });
  return json({ id }, { status: 201 });
});
