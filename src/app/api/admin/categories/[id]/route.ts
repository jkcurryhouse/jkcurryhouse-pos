import { NextRequest } from "next/server";
import { z } from "zod";
import { conflict, handler, json, notFound, parseBody } from "@/server/http";
import { adminContext } from "@/server/admin";

export const dynamic = "force-dynamic";

const body = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const PATCH = handler(async (req: NextRequest, { params }) => {
  const { db, audit } = await adminContext(req);
  const patch = await parseBody(req, body);
  const row = await db.menuCategory.update({ where: { id: params.id }, data: patch }).catch(() => null);
  if (!row) throw notFound();
  await audit("menu-change", `Category "${row.name}" updated`, patch);
  return json({ ok: true });
});

/** Categories with items can't be removed — hide them (active=false) or move the items first. */
export const DELETE = handler(async (req: NextRequest, { params }) => {
  const { db, audit } = await adminContext(req);
  if (await db.menuItem.count({ where: { categoryId: params.id, active: true } }))
    throw conflict("Move or archive this category's items first");
  const row = await db.menuCategory.update({ where: { id: params.id }, data: { active: false } }).catch(() => null);
  if (!row) throw notFound();
  await audit("menu-change", `Category "${row.name}" hidden`);
  return json({ ok: true });
});
