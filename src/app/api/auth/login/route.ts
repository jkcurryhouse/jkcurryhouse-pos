import { NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  createSessionToken,
  LOCKOUT_MINUTES,
  MAX_LOGIN_ATTEMPTS,
  normaliseEmail,
  publicStaff,
  setSessionCookie,
} from "@/server/auth";
import { burnTime, checkPassword } from "@/server/password";
import { ApiError, clientIp, handler, json, parseBody, unauthorized } from "@/server/http";
import { writeAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

const body = z.object({
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(200),
});

const GENERIC = "Email or password is incorrect";

export const POST = handler(async (req: NextRequest) => {
  const { email, password } = await parseBody(req, body);
  const db = getDb();
  const ip = clientIp(req);
  const s = await db.staff.findUnique({ where: { email: normaliseEmail(email) } });

  if (!s || !s.active) {
    await burnTime(password); // same response time whether or not the account exists
    throw unauthorized(GENERIC);
  }

  if (s.lockedUntil && s.lockedUntil > new Date()) {
    const mins = Math.ceil((s.lockedUntil.getTime() - Date.now()) / 60000);
    throw new ApiError(423, `Too many failed attempts — try again in ${mins} minute${mins === 1 ? "" : "s"} or ask an admin to unlock`, "locked");
  }

  if (!(await checkPassword(password, s.passwordHash))) {
    const attempts = s.failedLoginAttempts + 1;
    const lock = attempts >= MAX_LOGIN_ATTEMPTS;
    await db.staff.update({
      where: { id: s.id },
      data: {
        failedLoginAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : s.lockedUntil,
      },
    });
    await writeAudit(db, {
      type: lock ? "account-locked" : "login-failed",
      reason: lock ? `Account locked for ${LOCKOUT_MINUTES} min after ${MAX_LOGIN_ATTEMPTS} failed sign-ins` : "Wrong password",
      performedByStaffId: s.id,
      ip,
    });
    throw unauthorized(GENERIC);
  }

  const updated = await db.staff.update({
    where: { id: s.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await writeAudit(db, { type: "login", reason: "Signed in", performedByStaffId: s.id, ip });
  setSessionCookie(await createSessionToken(updated));
  return json({ staff: publicStaff(updated) });
});
