import { NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { createApprovalToken, hasRole, requireStaff } from "@/server/auth";
import { checkPassword } from "@/server/password";
import { clientIp, forbidden, handler, json, parseBody } from "@/server/http";
import { writeAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

const body = z.object({ managerId: z.string().min(1), password: z.string().min(1).max(200), purpose: z.string().max(80) });

/** A manager picks their name and types their password on someone else's session to
 * authorise one override. Returns a 15-minute signed approval that the POS attaches to the
 * refund / void / staff-discount op; the server verifies it again when applying the op. */
export const POST = handler(async (req: NextRequest) => {
  const session = await requireStaff();
  const { managerId, password, purpose } = await parseBody(req, body);
  const db = getDb();
  const m = await db.staff.findFirst({ where: { id: managerId, active: true } });
  const locked = m?.lockedUntil && m.lockedUntil > new Date();
  if (m && !locked && hasRole(m.role, "manager") && (await checkPassword(password, m.passwordHash))) {
    return json({ managerId: m.id, managerName: m.name, token: await createApprovalToken(m.id, purpose) });
  }
  await writeAudit(db, {
    type: "login-failed",
    reason: `Failed manager approval for "${purpose}"${m ? ` as ${m.name}` : ""}`,
    performedByStaffId: session.id,
    ip: clientIp(req),
  });
  throw forbidden(locked ? "That manager account is locked" : "Manager password not recognised");
});
