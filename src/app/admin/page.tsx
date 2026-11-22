"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { BarChart, Badge, Card, ErrorNote, PageHeader, Stat, fmtDateTime, gbp, useAdminData, th, td } from "@/components/admin/ui";
import { useStore } from "@/lib/store";

interface Dashboard {
  today: {
    netSales: number;
    paidOrders: number;
    allOrders: number;
    averageOrder: number;
    tips: number;
    discounts: number;
    covers: number;
    voids: number;
    refunds: number;
    onlineOrders: number;
    takings: Record<string, number>;
  };
  openTickets: { count: number; value: number };
  series: { day: string; net: number; orders: number }[];
  topItems: { name: string; qty: number; revenue: number }[];
  outOfStock: { id: string; name: string }[];
  till: { id: string; openedAt: number; openingFloat: number } | null;
  recentAudit: { type: string; reason: string; at: number; amount: number | null; staffName: string | null }[];
}

const dayLabel = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });

export default function AdminDashboard() {
  const { data, error } = useAdminData<Dashboard>("/api/admin/dashboard");
  const { toggleOutOfStock } = useStore();

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" })}
      />
      <ErrorNote error={error} />
      {!data ? (
        <p className="text-sm text-cardamom/40">Loading…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Net sales today" value={gbp(data.today.netSales)} hint={`${data.today.paidOrders} paid orders · inc. VAT`} />
            <Stat label="Average order" value={gbp(data.today.averageOrder)} hint={`${data.today.covers} covers`} />
            <Stat label="Open tickets" value={data.openTickets.count} hint={`${gbp(data.openTickets.value)} awaiting payment`} />
            <Stat
              label="Taken today"
              value={gbp((data.today.takings.card ?? 0) + (data.today.takings.cash ?? 0))}
              hint={`Card ${gbp(data.today.takings.card)} · Cash ${gbp(data.today.takings.cash)}`}
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="Net sales — last 14 days" className="lg:col-span-2">
              <BarChart
                label="Net sales per day for the last 14 days"
                data={data.series.map((s) => ({ key: s.day, label: dayLabel(s.day), value: s.net, sub: `${s.orders} orders` }))}
              />
            </Card>
            <Card title="Today at a glance">
              <dl className="text-sm space-y-2">
                {[
                  ["Orders (all)", data.today.allOrders],
                  ["Website orders", data.today.onlineOrders],
                  ["Tips", gbp(data.today.tips)],
                  ["Discounts given", gbp(data.today.discounts)],
                  ["Voids", data.today.voids],
                  ["Refunds", data.today.refunds],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between">
                    <dt className="text-cardamom/55">{k}</dt>
                    <dd className="font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-cardamom/10">
                  <dt className="text-cardamom/55">Till</dt>
                  <dd>
                    {data.till ? (
                      <Badge tone="good">Open since {fmtDateTime(data.till.openedAt)}</Badge>
                    ) : (
                      <Badge tone="warn">Closed</Badge>
                    )}
                  </dd>
                </div>
              </dl>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-4 items-start">
            <Card title="Best sellers today">
              {data.topItems.length === 0 ? (
                <p className="text-sm text-cardamom/40">No paid orders yet today.</p>
              ) : (
                <ol className="text-sm space-y-1.5">
                  {data.topItems.map((t) => (
                    <li key={t.name} className="flex justify-between gap-2">
                      <span className="truncate">{t.name}</span>
                      <span className="tabular-nums text-cardamom/60">×{t.qty}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card title="Out of stock (86'd)" actions={<Link href="/admin/menu" className="text-xs underline text-cardamom/50">Menu</Link>}>
              {data.outOfStock.length === 0 ? (
                <p className="text-sm text-cardamom/40">Everything is available.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.outOfStock.map((m) => (
                    <li key={m.id} className="flex items-center justify-between text-sm gap-2">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle size={13} className="text-chili" /> {m.name}
                      </span>
                      <button onClick={() => { toggleOutOfStock(m.id); setTimeout(() => location.reload(), 800); }} className="text-xs underline text-jade-dark">
                        Back in stock
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Recent activity" actions={<Link href="/admin/audit" className="text-xs underline text-cardamom/50">Audit log</Link>}>
              <table className="w-full">
                <tbody>
                  {data.recentAudit.map((a, i) => (
                    <tr key={i}>
                      <td className={`${td} !px-0 text-xs`}>
                        <span className="font-medium">{a.reason}</span>
                        <span className="block text-cardamom/45">
                          {a.staffName ?? "—"} · {fmtDateTime(a.at)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data.recentAudit.length === 0 && (
                    <tr>
                      <td className={th}>Nothing yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
