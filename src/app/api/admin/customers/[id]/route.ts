import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@/db";
import { handler, json, notFound, parseBody } from "@/server/http";
import { adminContext } from "@/server/admin";
import { loadOrders, serializeCustomer } from "@/server/serialize";
import { normalisePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest, { params }) => {
  const { db } = await adminContext(req);
  const c = await db.customer.findUnique({ where: { id: params.id } });
  if (!c) throw notFound();
  const orders = await loadOrders(db, { customerId: c.id }, { limit: 100, orderBy: "desc" });
  return json({ customer: serializeCustomer(c), orders });
});

const body = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(5).max(30).optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  postcode: z.string().trim().max(12).optional(),
  addressLine1: z.string().trim().max(120).optional(),
  street: z.string().trim().max(160).optional(),
  town: z.string().trim().max(80).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  marketingOptIn: z.boolean().optional(),
});

export const PATCH = handler(async (req: NextRequest, { params }) => {
  const { db, audit } = await adminContext(req);
  const b = await parseBody(req, body);
  const data: Prisma.CustomerUpdateInput = {};
  for (const [k, v] of Object.entries(b)) if (v !== undefined) (data as Record<string, unknown>)[k] = v === "" ? null : v;
  if (b.phone) data.phoneNormalised = normalisePhone(b.phone);
  const row = await db.customer.update({ where: { id: params.id }, data }).catch(() => null);
  if (!row) throw notFound();
  await audit(
    "customer-change",
    `Customer ${row.name} updated${b.marketingOptIn !== undefined ? ` (marketing ${b.marketingOptIn ? "opt-in" : "opt-out"})` : ""}`,
    { customerId: row.id }
  );
  return json({ ok: true });
});

/** GDPR erasure: personal data is wiped but the row (and the orders that reference it) is kept
 * for HMRC record-keeping. Order snapshots have their contact details anonymised too. */
export const DELETE = handler(async (req: NextRequest, { params }) => {
  const { db, audit } = await adminContext(req);
  const c = await db.customer.findUnique({ where: { id: params.id } });
  if (!c) throw notFound();
  await db.$transaction([
    db.customer.update({
      where: { id: c.id },
      data: {
        name: "Erased customer",
        phone: "",
        phoneNormalised: `erased-${c.id}`,
        email: null,
        postcode: "",
        addressLine1: "",
        street: "",
        town: null,
        notes: null,
        marketingOptIn: false,
        anonymisedAt: new Date(),
      },
    }),
    db.order.updateMany({
      where: { customerId: c.id },
      data: { deliveryDetails: { name: "Erased customer", phone: "", postcode: "", addressLine1: "", street: "" }, updatedAt: new Date() },
    }),
  ]);
  await audit("customer-change", "Customer personal data erased (GDPR request)", { customerId: c.id });
  return json({ ok: true });
});
