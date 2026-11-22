import { getSessionStaff, publicStaff } from "@/server/auth";
import { handler, json, unauthorized } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const s = await getSessionStaff();
  if (!s) throw unauthorized();
  return json({ staff: publicStaff(s) });
});
