import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { getDb } from "@/db";
import type { Staff } from "@/generated/prisma/client";
import { ApiError, forbidden, unauthorized } from "./http";

export const SESSION_COOKIE = "jkpos_session";
const SESSION_TTL_SECONDS = 14 * 60 * 60; // one long shift; idle sign-out is also enforced client-side
const APPROVAL_TTL_SECONDS = 15 * 60;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export type Role = "staff" | "manager" | "admin";
const RANK: Record<Role, number> = { staff: 0, manager: 1, admin: 2 };
export const hasRole = (role: string, min: Role) => (RANK[role as Role] ?? -1) >= RANK[min];

export type SessionStaff = Staff;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new ApiError(500, "SESSION_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

/** Password "version": changing or resetting a password signs out every existing session. */
const pwdVersion = (s: Pick<Staff, "passwordChangedAt" | "createdAt">) =>
  String((s.passwordChangedAt ?? s.createdAt).getTime());

export async function createSessionToken(s: Staff) {
  return new SignJWT({ typ: "session", pv: pwdVersion(s) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export function setSessionCookie(token: string) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie() {
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** Resolves the signed-in staff member, re-checking the DB on every call so deactivation,
 * role changes and password resets take effect immediately. */
export async function getSessionStaff(): Promise<SessionStaff | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== "session" || !payload.sub) return null;
    const s = await getDb().staff.findFirst({ where: { id: payload.sub, active: true } });
    if (!s || payload.pv !== pwdVersion(s)) return null;
    return s;
  } catch {
    return null;
  }
}

/** For every API except /me, /logout and /change-password. */
export async function requireStaff(min: Role = "staff"): Promise<SessionStaff> {
  const s = await getSessionStaff();
  if (!s) throw unauthorized();
  if (s.mustChangePassword) throw new ApiError(403, "Set a new password before continuing", "password_change_required");
  if (!hasRole(s.role, min)) throw forbidden();
  return s;
}

/** Short-lived proof that a manager re-entered their password to authorise one override. */
export async function createApprovalToken(managerId: string, purpose: string) {
  return new SignJWT({ typ: "approval", purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(managerId)
    .setIssuedAt()
    .setExpirationTime(`${APPROVAL_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyApprovalToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== "approval" || !payload.sub) return null;
    const row = await getDb().staff.findFirst({ where: { id: payload.sub, active: true }, select: { id: true, role: true } });
    if (!row || !hasRole(row.role, "manager")) return null;
    return row.id;
  } catch {
    return null;
  }
}

export function publicStaff(s: Staff) {
  return {
    id: s.id,
    name: s.name,
    initials: s.initials,
    role: s.role as Role,
    email: s.email,
    mustChangePassword: s.mustChangePassword,
  };
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();
