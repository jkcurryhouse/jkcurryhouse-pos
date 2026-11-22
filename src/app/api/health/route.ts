import { getDb } from "@/db";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

/** Lightweight probe the POS uses to confirm real connectivity (not just navigator.onLine). */
export async function GET() {
  try {
    await getDb().$queryRaw`select 1`;
    return json({ ok: true, db: true, at: Date.now() });
  } catch {
    return json({ ok: false, db: false, at: Date.now() }, { status: 503 });
  }
}
