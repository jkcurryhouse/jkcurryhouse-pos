import { getDb } from "@/db";
import { requireStaff } from "@/server/auth";
import { forbidden, handler, json, newId } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Demo only (ENABLE_DEMO_TOOLS=true): writes a paid website order exactly the way the
 * website does (POST /api/orders, then the Stripe webhook marking it paid), so the
 * "incoming online order" flow can be shown on the KDS without a real card payment.
 */
export const POST = handler(async () => {
  if (process.env.ENABLE_DEMO_TOOLS !== "true") throw forbidden("Demo tools are disabled");
  await requireStaff();
  const db = getDb();
  const menu = await db.menuItem.findMany({ where: { active: true, availableOnline: true, isAvailable: true }, take: 40 });
  if (menu.length === 0) return json({ ok: false });
  const picks = menu.sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2));
  const lines = picks.map((m, position) => ({ quantity: 1 + Math.floor(Math.random() * 2), m, position }));
  const subtotal = lines.reduce((s, l) => s + l.m.price * l.quantity, 0);
  const deliveryFee = subtotal < 25 ? 2.99 : 0;
  const total = +(subtotal + deliveryFee).toFixed(2);
  const pi = `pi_demo_${Date.now()}`;
  const order = await db.order.create({
    data: {
      type: "DELIVERY",
      status: "CONFIRMED",
      total,
      guestEmail: "demo.customer@example.com",
      address: "12 Market Place, Chippenham SN15 3HL",
      channel: "online",
      paymentStatus: "paid",
      sentToKitchen: true,
      deliveryFee,
      stripePaymentIntentId: pi,
      deliveryDetails: { name: "Demo Customer", phone: "07700 900456", postcode: "SN15 3HL", addressLine1: "12", street: "Market Place, Chippenham" },
      items: {
        create: lines.map((l) => ({ menuItemId: l.m.id, name: l.m.name, quantity: l.quantity, price: l.m.price, allergens: l.m.allergens, position: l.position })),
      },
      payments: {
        create: [{ id: newId("pay"), method: "card", amountPence: Math.round(total * 100), stripePaymentIntentId: pi, takenByStaffId: "online" }],
      },
    },
  });
  return json({ ok: true, orderId: order.id });
});
