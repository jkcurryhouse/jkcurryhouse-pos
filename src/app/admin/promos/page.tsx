"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageHeader,
  Toggle,
  fmtDate,
  gbp,
  td,
  th,
  useAdminData,
  useMutation,
} from "@/components/admin/ui";

interface Promo {
  id: string;
  code: string;
  label: string;
  description: string;
  percentOff: number;
  amountOff: number;
  isPercent: boolean;
  isGeneral: boolean;
  minSpend: number;
  validFrom: number | null;
  validTo: number | null;
  maxUses: number | null;
  useCount: number;
  channels: string[];
  active: boolean;
}

const toInputDate = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");

function status(p: Promo): [string, "good" | "warn" | "bad" | "neutral"] {
  const now = Date.now();
  if (!p.active) return ["Disabled", "neutral"];
  if (p.validFrom && p.validFrom > now) return ["Scheduled", "warn"];
  if (p.validTo && p.validTo < now) return ["Expired", "bad"];
  if (p.maxUses != null && p.useCount >= p.maxUses) return ["Used up", "bad"];
  return ["Live", "good"];
}

export default function PromosAdmin() {
  const { data, error, reload } = useAdminData<{ promos: Promo[] }>("/api/admin/promos");
  const [editing, setEditing] = useState<Partial<Promo> | null>(null);
  const m = useMutation();

  return (
    <>
      <PageHeader
        title="Promotions"
        subtitle="Shared with the website's Offers. Codes are checked on the server, so dates, minimum spend and usage limits always apply."
        actions={
          <Button variant="primary" onClick={() => setEditing({ channels: ["POS", "online"], active: true, minSpend: 0, isPercent: true })}>
            <Plus size={15} /> New code
          </Button>
        }
      />
      <ErrorNote error={error || m.error} />
      <Card>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Code</th>
                <th className={th}>Discount</th>
                <th className={th}>Valid</th>
                <th className={th}>Used</th>
                <th className={th}>Where</th>
                <th className={th}>Status</th>
                <th className={th}>On</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {(data?.promos ?? []).map((p) => {
                const [s, tone] = status(p);
                return (
                  <tr key={p.id}>
                    <td className={td}>
                      <p className="font-mono font-semibold">{p.code}</p>
                      <p className="text-xs text-cardamom/50">{p.label}</p>
                    </td>
                    <td className={td}>
                      {p.isPercent ? `${p.percentOff}% off` : `${gbp(p.amountOff)} off`}
                      {p.minSpend > 0 && <span className="block text-xs text-cardamom/50">min. spend {gbp(p.minSpend)}</span>}
                      {!p.isGeneral && <span className="block text-xs text-cardamom/50">signed-in website customers only</span>}
                    </td>
                    <td className={`${td} text-xs text-cardamom/60`}>
                      {p.validFrom || p.validTo ? `${fmtDate(p.validFrom)} – ${fmtDate(p.validTo)}` : "Always"}
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {p.useCount}
                      {p.maxUses != null && <span className="text-cardamom/45"> / {p.maxUses}</span>}
                    </td>
                    <td className={td}>
                      <div className="flex gap-1">{p.channels.map((c) => <Badge key={c}>{c === "online" ? "Web" : c}</Badge>)}</div>
                    </td>
                    <td className={td}>
                      <Badge tone={tone}>{s}</Badge>
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      <Toggle
                        checked={p.active}
                        onChange={async (v) => (await m.run(() => api(`/api/admin/promos/${p.id}`, { method: "PATCH", body: { active: v } }))) && reload()}
                        label=""
                      />
                    </td>
                    <td className={td}>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && <PromoEditor promo={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function PromoEditor({ promo, onClose, onSaved }: { promo: Partial<Promo>; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState({
    code: promo.code ?? "",
    label: promo.label ?? "",
    isPercent: promo.isPercent ?? true,
    discount: promo.isPercent === false ? String(promo.amountOff ?? "") : promo.percentOff != null ? String(promo.percentOff) : "",
    description: promo.description ?? "",
    minSpend: promo.minSpend ? String(promo.minSpend) : "",
    validFrom: toInputDate(promo.validFrom ?? null),
    validTo: toInputDate(promo.validTo ?? null),
    maxUses: promo.maxUses != null ? String(promo.maxUses) : "",
    pos: promo.channels?.includes("POS") ?? true,
    online: promo.channels?.includes("online") ?? true,
  });
  const m = useMutation();
  const isNew = !promo.id;
  async function save() {
    const channels = [d.pos && "POS", d.online && "online"].filter(Boolean);
    if (!channels.length) return m.setError("Choose at least one place the code can be used");
    const body = {
      ...(isNew ? { code: d.code } : {}),
      label: d.label,
      description: d.description,
      isPercent: d.isPercent,
      discount: Number(d.discount),
      minSpend: Number(d.minSpend || 0),
      validFrom: d.validFrom ? new Date(d.validFrom + "T00:00:00").getTime() : null,
      validTo: d.validTo ? new Date(d.validTo + "T23:59:59").getTime() : null,
      maxUses: d.maxUses ? Number(d.maxUses) : null,
      channels,
    };
    const ok = await m.run(() => (isNew ? api("/api/admin/promos", { body }) : api(`/api/admin/promos/${promo.id}`, { method: "PATCH", body })));
    if (ok) onSaved();
  }
  return (
    <Modal
      title={isNew ? "New promo code" : `Edit ${promo.code}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={m.busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <ErrorNote error={m.error} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code">
          <Input value={d.code} disabled={!isNew} onChange={(e) => setD({ ...d, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} className="font-mono" autoFocus />
        </Field>
        <Field label={d.isPercent ? "% off" : "£ off"}>
          <div className="flex gap-2">
            <select
              value={d.isPercent ? "pct" : "gbp"}
              onChange={(e) => setD({ ...d, isPercent: e.target.value === "pct" })}
              className="rounded-lg border border-cardamom/15 bg-white px-2 text-sm"
              aria-label="Discount type"
            >
              <option value="pct">%</option>
              <option value="gbp">£</option>
            </select>
            <Input inputMode="decimal" value={d.discount} onChange={(e) => setD({ ...d, discount: e.target.value.replace(/[^0-9.]/g, "") })} />
          </div>
        </Field>
        <Field label="Title (shown on receipts and the website)" className="col-span-2">
          <Input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder="e.g. Diwali 15% off" />
        </Field>
        <Field label="Description (website offers page)" className="col-span-2">
          <Input value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
        </Field>
        <Field label="Valid from">
          <Input type="date" value={d.validFrom} onChange={(e) => setD({ ...d, validFrom: e.target.value })} />
        </Field>
        <Field label="Valid until">
          <Input type="date" value={d.validTo} onChange={(e) => setD({ ...d, validTo: e.target.value })} />
        </Field>
        <Field label="Minimum spend (£)">
          <Input inputMode="decimal" value={d.minSpend} onChange={(e) => setD({ ...d, minSpend: e.target.value.replace(/[^0-9.]/g, "") })} />
        </Field>
        <Field label="Max uses" hint="Blank = unlimited">
          <Input inputMode="numeric" value={d.maxUses} onChange={(e) => setD({ ...d, maxUses: e.target.value.replace(/\D/g, "") })} />
        </Field>
        <div className="col-span-2 flex gap-6 pt-1">
          <Toggle checked={d.pos} onChange={(v) => setD({ ...d, pos: v })} label="In restaurant (POS)" />
          <Toggle checked={d.online} onChange={(v) => setD({ ...d, online: v })} label="Website" />
        </div>
      </div>
    </Modal>
  );
}
