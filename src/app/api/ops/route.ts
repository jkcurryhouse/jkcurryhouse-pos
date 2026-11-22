import { NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { requireStaff } from "@/server/auth";
import { clientIp, handler, json, parseBody } from "@/server/http";
import { envelopeSchema, processOps } from "@/server/ops";
import { serializeMenuItem } from "@/server/serialize";

export const dynamic = "force-dynamic";

const body = z.object({ ops: z.array(envelopeSchema).min(1).max(100) });

/** Applies queued POS changes (the offline outbox). Idempotent per op id. */
export const POST = handler(async (req: NextRequest) => {
  const session = await requireStaff();
  const { ops } = await parseBody(req, body);
  const results = await processOps(session, ops, clientIp(req));
  const itemIds = Array.from(new Set(results.flatMap((r) => r.menuItemIds ?? [])));
  const menuItems = itemIds.length
    ? (await getDb().menuItem.findMany({ where: { id: { in: itemIds } } })).map(serializeMenuItem)
    : [];
  return json({ results, menuItems, serverTime: Date.now() });
});
