"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useStore, RestaurantSettings } from "@/lib/store";
import { Badge, Button, Card, ErrorNote, Field, Input, PageHeader, Toggle, useAdminData, useMutation } from "@/components/admin/ui";

interface SettingsResponse {
  settings: RestaurantSettings;
  nextOrderNumber: number;
  network: { yourIp: string; allowlist: string[]; enforced: boolean };
  environment: { demoTools: boolean; databaseSsl: string };
}

export default function SettingsAdmin() {
  const { currentStaff } = useAuth();
  const { refreshNow } = useStore();
  const { data, error, reload } = useAdminData<SettingsResponse>("/api/admin/settings");
  const [f, setF] = useState<(RestaurantSettings & { address: string; tips: string; nextOrderNumber: number }) | null>(null);
  const [saved, setSaved] = useState(false);
  const m = useMutation();
  const isAdmin = currentStaff?.role === "admin";

  useEffect(() => {
    if (data) setF({ ...data.settings, address: data.settings.addressLines.join("\n"), tips: data.settings.tipPresets.join(", "), nextOrderNumber: data.nextOrderNumber });
  }, [data]);

  if (!f) return <><PageHeader title="Settings" /><ErrorNote error={error} /><p className="text-sm text-cardamom/40">Loading…</p></>;

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF({ ...f, [k]: v });
    setSaved(false);
  };

  async function save() {
    if (!f || !data) return;
    const body: Record<string, unknown> = {
      name: f.name,
      legalName: f.legalName,
      tagline: f.tagline,
      addressLines: f.address.split("\n").map((s) => s.trim()).filter(Boolean),
      phone: f.phone,
      email: f.email,
      vatNumber: f.vatNumber,
      companyNumber: f.companyNumber,
      receiptFooter: f.receiptFooter,
      vatRatePercent: Number(f.vatRatePercent),
      defaultServiceChargePercent: Number(f.defaultServiceChargePercent),
      serviceChargeMinGuests: Number(f.serviceChargeMinGuests),
      inactivityLogoutMinutes: Number(f.inactivityLogoutMinutes),
      autoSendToKitchen: f.autoSendToKitchen,
      kdsWarnMinutes: Number(f.kdsWarnMinutes),
      tipPresets: f.tips.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 0),
    };
    if (Number(f.nextOrderNumber) !== data.nextOrderNumber) body.nextOrderNumber = Number(f.nextOrderNumber);
    if (await m.run(() => api("/api/admin/settings", { method: "PATCH", body }))) {
      setSaved(true);
      reload();
      refreshNow();
    }
  }

  const num = (k: keyof typeof f) => ({ value: String(f[k] ?? ""), onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value.replace(/[^0-9.]/g, "") as never), inputMode: "decimal" as const, disabled: !isAdmin });
  const txt = (k: keyof typeof f) => ({ value: String(f[k] ?? ""), onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never), disabled: !isAdmin });

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Restaurant details, receipts and how the POS behaves. Changes reach every terminal on its next sync."
        actions={isAdmin && <Button variant="primary" busy={m.busy} onClick={save}>{saved ? "Saved ✓" : "Save settings"}</Button>}
      />
      {!isAdmin && <p className="text-sm rounded-lg bg-gold/10 border border-gold/30 px-3 py-2 mb-4">Only an admin can change settings.</p>}
      <ErrorNote error={error || m.error} />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Restaurant & receipts">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Trading name"><Input {...txt("name")} /></Field>
            <Field label="Tagline"><Input {...txt("tagline")} /></Field>
            <Field label="Legal / company name"><Input {...txt("legalName")} /></Field>
            <Field label="Company number"><Input {...txt("companyNumber")} /></Field>
            <Field label="Address (one line per row)" className="col-span-2">
              <textarea value={f.address} disabled={!isAdmin} onChange={(e) => set("address", e.target.value)} rows={3} className="w-full rounded-lg border border-cardamom/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold/70" />
            </Field>
            <Field label="Phone"><Input {...txt("phone")} /></Field>
            <Field label="Email"><Input {...txt("email")} /></Field>
            <Field label="VAT registration number" hint="Printed on every receipt — required for a valid UK VAT receipt."><Input {...txt("vatNumber")} placeholder="GB123456789" /></Field>
            <Field label="Receipt footer"><Input {...txt("receiptFooter")} /></Field>
          </div>
        </Card>

        <Card title="Tax, service & tips">
          <div className="grid grid-cols-2 gap-3">
            <Field label="VAT rate (%)" hint="UK standard rate is 20%. Menu prices include VAT."><Input {...num("vatRatePercent")} /></Field>
            <Field label="Suggested service charge (%)" hint="Discretionary; added at checkout."><Input {...num("defaultServiceChargePercent")} /></Field>
            <Field label="Suggest service charge from (guests)"><Input {...num("serviceChargeMinGuests")} /></Field>
            <Field label="Tip presets (%)" hint="Comma-separated, e.g. 10, 12, 15"><Input value={f.tips} disabled={!isAdmin} onChange={(e) => set("tips", e.target.value)} /></Field>
          </div>
        </Card>

        <Card title="POS behaviour">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Auto sign-out after (minutes idle)"><Input {...num("inactivityLogoutMinutes")} /></Field>
            <Field label="Kitchen ticket warning after (minutes)"><Input {...num("kdsWarnMinutes")} /></Field>
            <Field label="Next order number" hint="Only change at the start of a day."><Input {...num("nextOrderNumber")} /></Field>
            <div className="flex items-end pb-2">
              <Toggle checked={f.autoSendToKitchen} onChange={(v) => isAdmin && set("autoSendToKitchen", v)} label="Send new orders to the Kitchen Display automatically" />
            </div>
          </div>
        </Card>

        <Card title="Network & security">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              {data!.network.enforced ? <ShieldCheck size={16} className="text-jade" /> : <ShieldAlert size={16} className="text-chili" />}
              {data!.network.enforced ? "Restaurant network allow-list is enforced." : "No IP allow-list set — the POS is reachable from anywhere."}
            </div>
            <p className="text-cardamom/60">This device&apos;s address: <span className="font-mono">{data!.network.yourIp}</span></p>
            {data!.network.allowlist.length > 0 && (
              <div className="flex flex-wrap gap-1">{data!.network.allowlist.map((ip) => <Badge key={ip}>{ip}</Badge>)}</div>
            )}
            <p className="text-xs text-cardamom/50">
              The allow-list is the <code>POS_ALLOWED_IPS</code> environment variable in Amplify (redeploy after changing it). Database TLS mode:{" "}
              <span className="font-mono">{data!.environment.databaseSsl}</span>. Demo tools {data!.environment.demoTools ? "on" : "off"}.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
