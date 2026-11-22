import "server-only";
import bcrypt from "bcryptjs";
import { z } from "zod";

const BCRYPT_COST = 12;

// A few of the most common passwords; length + this list is what NCSC guidance asks for.
const COMMON = new Set([
  "password", "password1", "password123", "passw0rd", "qwerty123", "qwertyuiop", "1234567890",
  "123456789", "12345678910", "letmein123", "welcome123", "iloveyou12", "admin12345",
  "curryhouse", "jkcurryhouse", "restaurant", "football12", "monkey1234", "sunshine12",
  "changeme123", "trustno1234",
]);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters — a short phrase is easiest to remember")
  .max(72, "Use 72 characters or fewer");

/** Returns an error message, or null if the password is acceptable. */
export function passwordProblem(password: string, ctx: { email?: string; name?: string }): string | null {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return parsed.error.issues[0].message;
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return "That password is too common — choose another";
  const local = ctx.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 3 && lower.includes(local)) return "Don't include your email address in the password";
  const first = ctx.name?.split(/\s+/)[0]?.toLowerCase();
  if (first && first.length >= 3 && lower.includes(first)) return "Don't include your name in the password";
  return null;
}

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);
export const checkPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are valid.
const DUMMY_HASH = "$2b$12$8CMpueE4dclxmN3HffG3bODEJLRR29ZckMsbXQnPaQU4GJDA4ha.m";
export const burnTime = (password: string) => bcrypt.compare(password, DUMMY_HASH);

/** Human-readable temporary password for admin resets, e.g. "maple-river-4821". */
export function temporaryPassword() {
  const words = ["saffron", "cumin", "mango", "tamarind", "cardamom", "ginger", "pepper", "masala", "lotus", "monsoon", "river", "maple", "harbour", "copper", "amber", "willow"];
  const r = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  return `${words[r(words.length)]}-${words[r(words.length)]}-${1000 + r(9000)}`;
}
