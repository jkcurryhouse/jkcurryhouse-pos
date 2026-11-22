import "server-only";
import { getDb } from "@/db";
import { conflict } from "./http";
import { normaliseEmail } from "./auth";

export async function assertEmailUnused(email: string, exceptId?: string) {
  const row = await getDb().staff.findUnique({ where: { email: normaliseEmail(email) }, select: { id: true } });
  if (row && row.id !== exceptId) throw conflict("Another account already uses that email address");
}
