import { clearSessionCookie } from "@/server/auth";
import { handler, json } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = handler(async () => {
  clearSessionCookie();
  return json({ ok: true });
});
