import { NextRequest } from "next/server";
import { z } from "zod";
import { conflict, badRequest, handler, json, newId, parseBody } from "@/server/http";
import { adminContext } from "@/server/admin";
import { RESTAURANT_ID } from "@/server/ops";
import { normaliseEmail } from "@/server/auth";
import { hashPassword, passwordProblem, temporaryPassword } from "@/server/password";
import { assertEmailUnused } from "@/server/staffAdmin";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  const { db } = await adminContext(req, "manager");
  const rows = await db.staff.findMany({ where: { restaurantId: RESTAURANT_ID }, orderBy: { name: "asc" } });
  return json({
    staff: rows.map((s) => ({
      id: s.id,
      name: s.name,
      initials: s.initials,
      role: s.role,
      email: s.email,
      phone: s.phone,
      active: s.active,
      locked: !!s.lockedUntil && s.lockedUntil > new Date(),
      mustChangePassword: s.mustChangePassword,
      lastLoginAt: s.lastLoginAt?.getTime() ?? null,
      passwordChangedAt: s.passwordChangedAt?.getTime() ?? null,
      createdAt: s.createdAt.getTime(),
    })),
  });
});

const body = z.object({
  name: z.string().trim().min(1).max(80),
  initials: z.string().trim().min(1).max(3).optional(),
  email: z.string().trim().email().max(200),
  role: z.enum(["staff", "manager", "admin"]),
  phone: z.string().max(30).optional(),
  /** Omit to have a temporary password generated. */
  password: z.string().max(200).optional(),
});

/** Creates an account. The person must choose their own password the first time they sign in. */
export const POST = handler(async (req: NextRequest) => {
  const { db, audit, staff } = await adminContext(req, "admin");
  const b = await parseBody(req, body);
  if (b.role === "admin" && staff.role !== "admin") throw conflict("Only an admin can create admins");
  const email = normaliseEmail(b.email);
  await assertEmailUnused(email);
  const generated = !b.password;
  const password = b.password || temporaryPassword();
  if (!generated) {
    const problem = passwordProblem(password, { email, name: b.name });
    if (problem) throw badRequest(problem);
  }
  const initials =
    b.initials?.toUpperCase() ||
    b.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const id = newId("staff");
  await db.staff.create({
    data: {
      id,
      restaurantId: RESTAURANT_ID,
      name: b.name,
      initials,
      email,
      role: b.role,
      phone: b.phone || null,
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    },
  });
  await audit("staff-change", `Staff account created for ${b.name} (${b.role})`, { staffId: id });
  // The temporary password is shown to the admin once and never stored in plain text.
  return json({ id, temporaryPassword: generated ? password : undefined }, { status: 201 });
});
