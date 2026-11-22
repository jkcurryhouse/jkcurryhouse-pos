import { NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { createSessionToken, getSessionStaff, publicStaff, setSessionCookie } from "@/server/auth";
import { checkPassword, hashPassword, passwordProblem } from "@/server/password";
import { badRequest, clientIp, handler, json, parseBody, unauthorized } from "@/server/http";
import { writeAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

const body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().max(200) });

/** Change your own password. Also used to replace a temporary password set by an admin.
 * Every other session for this account is signed out (the session token embeds the password version). */
export const POST = handler(async (req: NextRequest) => {
  const s = await getSessionStaff();
  if (!s) throw unauthorized();
  const { currentPassword, newPassword } = await parseBody(req, body);
  if (!(await checkPassword(currentPassword, s.passwordHash))) throw badRequest("Your current password is incorrect");
  if (newPassword === currentPassword) throw badRequest("Choose a password you haven't just used");
  const problem = passwordProblem(newPassword, { email: s.email, name: s.name });
  if (problem) throw badRequest(problem);
  const db = getDb();
  const updated = await db.staff.update({
    where: { id: s.id },
    data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date(), mustChangePassword: false },
  });
  await writeAudit(db, { type: "password-change", reason: "Changed own password", performedByStaffId: s.id, ip: clientIp(req) });
  setSessionCookie(await createSessionToken(updated)); // keep this device signed in
  return json({ staff: publicStaff(updated) });
});
