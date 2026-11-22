import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@/db";
import { badRequest, conflict, handler, json, notFound, parseBody } from "@/server/http";
import { adminContext } from "@/server/admin";
import { normaliseEmail } from "@/server/auth";
import { hashPassword, passwordProblem, temporaryPassword } from "@/server/password";
import { assertEmailUnused } from "@/server/staffAdmin";

export const dynamic = "force-dynamic";

const body = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  initials: z.string().trim().min(1).max(3).optional(),
  email: z.string().trim().email().max(200).optional(),
  role: z.enum(["staff", "manager", "admin"]).optional(),
  phone: z.string().max(30).nullable().optional(),
  active: z.boolean().optional(),
  unlock: z.boolean().optional(),
  /** Generate a temporary password; the person must change it at next sign-in. */
  resetPassword: z.boolean().optional(),
  /** Or set a specific temporary password (still must be changed at next sign-in). */
  password: z.string().max(200).optional(),
});

export const PATCH = handler(async (req: NextRequest, { params }) => {
  const { db, audit, staff: me } = await adminContext(req, "admin");
  const b = await parseBody(req, body);
  const target = await db.staff.findUnique({ where: { id: params.id } });
  if (!target) throw notFound();

  // Never lock the restaurant out of its own admin panel.
  if (target.role === "admin" && ((b.role && b.role !== "admin") || b.active === false)) {
    const others = await db.staff.count({ where: { active: true, role: "admin", id: { not: target.id } } });
    if (others === 0) throw conflict("You can't remove the last active admin");
  }
  if (target.id === me.id && b.active === false) throw conflict("You can't deactivate your own account");
  if (target.id === me.id && (b.resetPassword || b.password)) throw conflict("Use “Change my password” for your own account");

  const data: Prisma.StaffUpdateInput = {};
  if (b.name) data.name = b.name;
  if (b.initials) data.initials = b.initials.toUpperCase();
  if (b.role) data.role = b.role;
  if (b.phone !== undefined) data.phone = b.phone || null;
  if (b.active !== undefined) data.active = b.active;
  if (b.email) {
    const email = normaliseEmail(b.email);
    await assertEmailUnused(email, target.id);
    data.email = email;
  }
  if (b.unlock) {
    data.lockedUntil = null;
    data.failedLoginAttempts = 0;
  }
  let temp: string | undefined;
  if (b.resetPassword || b.password) {
    const pw = b.password || (temp = temporaryPassword());
    if (b.password) {
      const problem = passwordProblem(pw, { email: target.email, name: target.name });
      if (problem) throw badRequest(problem);
    }
    data.passwordHash = await hashPassword(pw);
    data.mustChangePassword = true;
    data.passwordChangedAt = new Date(); // signs the person out everywhere
    data.failedLoginAttempts = 0;
    data.lockedUntil = null;
  }
  if (b.active === false) data.passwordChangedAt = new Date(); // end their sessions now
  await db.staff.update({ where: { id: target.id }, data });

  const what = [
    (b.resetPassword || b.password) && "password reset",
    b.role && b.role !== target.role && `role ${target.role} → ${b.role}`,
    b.active === false && "deactivated",
    b.active === true && !target.active && "reactivated",
    b.unlock && "unlocked",
    b.email && normaliseEmail(b.email) !== target.email && "email changed",
    (b.name || b.initials || b.phone !== undefined) && "details edited",
  ].filter(Boolean);
  await audit("staff-change", `${target.name}: ${what.join(", ") || "updated"}`, { staffId: target.id });
  return json({ ok: true, temporaryPassword: temp });
});
