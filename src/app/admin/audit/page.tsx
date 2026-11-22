"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, DateRange, ErrorNote, PageHeader, Select, fmtDateTime, gbp, londonDay, td, th, useAdminData } from "@/components/admin/ui";

interface Entry {
  id: string;
  type: string;
  reason: string;
  orderNumber: number | null;
  amount: number | null;
  performedBy: string;
  approvedBy: string | null;
  ip: string | null;
  at: number;
}

const GROUPS: Record<string, string> = {
  "": "Everything",
  "refund,void,staff-discount,manager-override": "Money: refunds, voids, discounts, merges",
  "login,login-failed,account-locked,password-change": "Sign-ins, failed sign-ins & password changes",
  "till-open,till-close": "Till",
  "menu-change,promo-change": "Menu & promotions",
  "staff-change,settings-change": "Staff & settings",
  "customer-change,data-export": "Customer data & exports",
};

const tone = (t: string) =>
  ["refund", "void", "login-failed", "account-locked"].includes(t) ? "bad" : ["staff-discount", "manager-override", "till-close"].includes(t) ? "warn" : "neutral";

const PAGE = 100;

export default function AuditAdmin() {
  const { staffDirectory } = useStore();
  const [from, setFrom] = useState(londonDay(-6));
  const [to, setTo] = useState(londonDay(0));
  const [types, setTypes] = useState("");
  const [staffId, setStaffId] = useState("");
  const [offset, setOffset] = useState(0);
  const p = new URLSearchParams({ from, to, limit: String(PAGE), offset: String(offset) });
  if (types) p.set("types", types);
  if (staffId) p.set("staffId", staffId);
  const { data, error } = useAdminData<{ entries: Entry[]; total: number }>(`/api/admin/audit?${p}`);

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Append-only record of overrides, sign-ins and admin changes, with who did it and who authorised it."
        actions={<a href={`/api/admin/export?type=audit&from=${from}&to=${to}`}><Button><Download size={14} /> Export CSV</Button></a>}
      />
      <div className="flex flex-col gap-3 mb-4">
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setOffset(0); }} />
        <div className="flex gap-2 flex-wrap">
          <Select value={types} onChange={(e) => { setTypes(e.target.value); setOffset(0); }} className="!w-72">
            {Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select value={staffId} onChange={(e) => { setStaffId(e.target.value); setOffset(0); }} className="!w-48">
            <option value="">All staff</option>
            {staffDirectory.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      </div>
      <ErrorNote error={error} />
      <Card>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>When</th>
                <th className={th}>Type</th>
                <th className={th}>What</th>
                <th className={th}>Order</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={th}>By</th>
                <th className={th}>Authorised by</th>
              </tr>
            </thead>
            <tbody>
              {(data?.entries ?? []).map((e) => (
                <tr key={e.id}>
                  <td className={`${td} text-xs whitespace-nowrap`}>{fmtDateTime(e.at)}</td>
                  <td className={td}><Badge tone={tone(e.type) as "bad"}>{e.type}</Badge></td>
                  <td className={`${td} text-xs`}>{e.reason}{e.ip && <span className="block text-cardamom/35">{e.ip}</span>}</td>
                  <td className={`${td} text-xs tabular-nums`}>{e.orderNumber ? `#${e.orderNumber}` : ""}</td>
                  <td className={`${td} text-right text-xs tabular-nums`}>{e.amount != null ? gbp(e.amount) : ""}</td>
                  <td className={`${td} text-xs`}>{e.performedBy}</td>
                  <td className={`${td} text-xs`}>{e.approvedBy ?? ""}</td>
                </tr>
              ))}
              {data && data.entries.length === 0 && <tr><td colSpan={7} className={`${td} text-center text-cardamom/40`}>Nothing logged for this filter.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-4 text-xs text-cardamom/50">
          <span>{data ? `${data.total} entries` : ""}</span>
          <div className="flex gap-2">
            <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
            <Button size="sm" disabled={!data || offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
          </div>
        </div>
      </Card>
    </>
  );
}
