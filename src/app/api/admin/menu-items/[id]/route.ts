import { NextRequest } from "next/server";
import { Prisma } from "@/db";
import { handler, json, notFound } from "@/server/http";
import { adminContext } from "@/server/admin";
import { menuItemColumns, menuItemSchema } from "@/server/menuSchema";

export const dynamic = "force-dynamic";

export const PATCH = handler(async (req: NextRequest, { params }) => {
  const { db, audit } = await adminContext(req);
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const b = menuItemSchema.partial().parse(raw);
  const before = await db.menuItem.findUnique({ where: { id: params.id } });
  if (!before) throw notFound();
  // only apply keys the client actually sent (zod fills defaults for the rest)
  const data = menuItemColumns(b, (k) => k in raw) as Prisma.MenuItemUncheckedUpdateInput;
  await db.menuItem.update({ where: { id: params.id }, data });

  const changes: string[] = [];
  if (typeof data.price === "number" && data.price !== before.price) changes.push(`price £${before.price.toFixed(2)} → £${data.price.toFixed(2)}`);
  if (data.isAvailable === false && before.isAvailable) changes.push("out of stock");
  if (data.isAvailable === true && !before.isAvailable) changes.push("back in stock");
  if (data.active === false) changes.push("archived");
  if (data.active === true && !before.active) changes.push("restored");
  await audit("menu-change", `Menu item "${before.name}" updated${changes.length ? ` (${changes.join(", ")})` : ""}`, { itemId: before.id, fields: Object.keys(data) });
  return json({ ok: true });
});

/** Archive (soft delete) — past orders keep their lines, and the website stops showing it. */
export const DELETE = handler(async (req: NextRequest, { params }) => {
  const { db, audit } = await adminContext(req);
  const row = await db.menuItem.update({ where: { id: params.id }, data: { active: false } }).catch(() => null);
  if (!row) throw notFound();
  await audit("menu-change", `Menu item "${row.name}" archived`, { itemId: row.id });
  return json({ ok: true });
});
