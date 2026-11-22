"use client";

import { useState } from "react";
import { Download, ShieldX } from "lucide-react";
import { api } from "@/lib/api";
import type { Customer, Order } from "@/lib/types";
import { netSubtotal } from "@/lib/billing";
import { OrderDetail } from "@/components/admin/OrderDetail";
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, PageHeader, Toggle, fmtDate, fmtDateTime, gbp, paymentTone, td, th, useAdminData, useMutation } from "@/components/admin/ui";

const PAGE = 50;

export default function CustomersAdmin() {
  const [q, setQ] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
  if (q.trim()) params.set("q", q.trim());
  if (optIn) params.set("optIn", "1");
  const { data, error, reload } = useAdminData<{ customers: Customer[]; total: number }>(`/api/admin/customers?${params}`);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Captured for takeaway and delivery orders (shared with the website). Marketing only with explicit opt-in."
        actions={
          <>
            <a href="/api/admin/export?type=customers&from=2000-01-01">
              <Button><Download size={14} /> All customers</Button>
            </a>
            <a href="/api/admin/export?type=customers&optIn=1&from=2000-01-01">
              <Button><Download size={14} /> Marketing list</Button>
            </a>
          </>
        }
      />
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <Input placeholder="Search name, phone or postcode" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} className="!w-72" />
        <Toggle checked={optIn} onChange={(v) => { setOptIn(v); setOffset(0); }} label="Marketing opt-in only" />
      </div>
      <ErrorNote error={error} />
      <Card>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Phone</th>
                <th className={th}>Address</th>
                <th className={`${th} text-right`}>Orders</th>
                <th className={th}>Last order</th>
                <th className={th}>Marketing</th>
              </tr>
            </thead>
            <tbody>
              {(data?.customers ?? []).map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-gold/5" onClick={() => setOpen(c.id)}>
                  <td className={`${td} font-medium`}>{c.name}</td>
                  <td className={`${td} text-xs`}>{c.phone}</td>
                  <td className={`${td} text-xs text-cardamom/60`}>{[c.addressLine1, c.street, c.postcode].filter(Boolean).join(", ")}</td>
                  <td className={`${td} text-right tabular-nums`}>{c.orderCount}</td>
                  <td className={`${td} text-xs text-cardamom/60`}>{fmtDate(c.lastOrderAt)}</td>
                  <td className={td}>{c.marketingOptIn ? <Badge tone="good">Opted in</Badge> : <Badge>No</Badge>}</td>
                </tr>
              ))}
              {data && data.customers.length === 0 && (
                <tr><td colSpan={6} className={`${td} text-center text-cardamom/40`}>No customers found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-4 text-xs text-cardamom/50">
          <span>{data ? `${data.total} customers` : ""}</span>
          <div className="flex gap-2">
            <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
            <Button size="sm" disabled={!data || offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
          </div>
        </div>
      </Card>
      {open && <CustomerDrawer id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}

function CustomerDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data, reload } = useAdminData<{ customer: Customer; orders: Order[] }>(`/api/admin/customers/${id}`);
  const [form, setForm] = useState<Partial<Customer> | null>(null);
  const [orderOpen, setOrderOpen] = useState<string | null>(null);
  const m = useMutation();
  const c = data?.customer;
  const f = form ?? c ?? {};
  const set = (k: keyof Customer, v: unknown) => setForm({ ...(form ?? c), [k]: v });

  async function save() {
    if (!form) return;
    const body = { name: f.name, phone: f.phone, email: f.email ?? "", postcode: f.postcode, addressLine1: f.addressLine1, street: f.street, town: f.town ?? null, notes: f.notes ?? null, marketingOptIn: f.marketingOptIn };
    if (await m.run(() => api(`/api/admin/customers/${id}`, { method: "PATCH", body }))) {
      setForm(null);
      reload();
      onChanged();
    }
  }
  async function erase() {
    if (!confirm("Erase this customer's personal data? Their orders stay (for HMRC) but name, phone and address are wiped everywhere. This can't be undone.")) return;
    if (await m.run(() => api(`/api/admin/customers/${id}`, { method: "DELETE" }))) {
      onChanged();
      onClose();
    }
  }
  const spend = (data?.orders ?? []).filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + netSubtotal(o), 0);

  return (
    <Modal
      wide
      title={c?.name ?? "Customer"}
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" onClick={erase} className="mr-auto"><ShieldX size={14} /> Erase (GDPR)</Button>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" disabled={!form} busy={m.busy} onClick={save}>Save changes</Button>
        </>
      }
    >
      <ErrorNote error={m.error} />
      {!c ? (
        <p className="text-sm text-cardamom/40">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-white border border-cardamom/10 p-3"><p className="text-xs text-cardamom/50">Orders</p><p className="font-display text-xl">{c.orderCount}</p></div>
            <div className="rounded-xl bg-white border border-cardamom/10 p-3"><p className="text-xs text-cardamom/50">Spend (paid)</p><p className="font-display text-xl">{gbp(spend)}</p></div>
            <div className="rounded-xl bg-white border border-cardamom/10 p-3"><p className="text-xs text-cardamom/50">Customer since</p><p className="font-display text-xl">{fmtDate(c.createdAt)}</p></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name"><Input value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Phone"><Input value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Email"><Input value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Postcode"><Input value={f.postcode ?? ""} onChange={(e) => set("postcode", e.target.value.toUpperCase())} /></Field>
            <Field label="House number / name"><Input value={f.addressLine1 ?? ""} onChange={(e) => set("addressLine1", e.target.value)} /></Field>
            <Field label="Street"><Input value={f.street ?? ""} onChange={(e) => set("street", e.target.value)} /></Field>
            <Field label="Notes (e.g. regular order, access instructions)" className="sm:col-span-2"><Input value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
            <div className="sm:col-span-2">
              <Toggle checked={!!f.marketingOptIn} onChange={(v) => set("marketingOptIn", v)} label="Customer has agreed to receive offers (record only with their explicit consent)" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cardamom/45 mb-2">Order history</p>
            <table className="w-full">
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-gold/5" onClick={() => setOrderOpen(o.id)}>
                    <td className={`${td} tabular-nums font-semibold`}>#{o.orderNumber}</td>
                    <td className={`${td} text-xs text-cardamom/60`}>{fmtDateTime(o.createdAt)}</td>
                    <td className={`${td} text-xs`}>{o.orderType}</td>
                    <td className={`${td} text-xs text-cardamom/60 truncate max-w-[220px]`}>{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</td>
                    <td className={`${td} text-right tabular-nums`}>{gbp(netSubtotal(o))}</td>
                    <td className={td}><Badge tone={paymentTone(o.paymentStatus)}>{o.paymentStatus}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {orderOpen && <OrderDetail orderId={orderOpen} onClose={() => setOrderOpen(null)} />}
    </Modal>
  );
}
