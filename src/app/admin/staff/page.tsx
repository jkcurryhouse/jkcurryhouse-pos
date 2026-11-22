"use client";

import { useState } from "react";
import { Plus, KeyRound, Unlock, Copy, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import {
  Badge,
  Button,
  Card,
  ErrorNote,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  fmtDateTime,
  td,
  th,
  useAdminData,
  useMutation,
} from "@/components/admin/ui";

interface StaffRow {
  id: string;
  name: string;
  initials: string;
  role: "staff" | "manager" | "admin";
  email: string;
  phone: string | null;
  active: boolean;
  locked: boolean;
  mustChangePassword: boolean;
  lastLoginAt: number | null;
}

const ROLE_HELP: Record<string, string> = {
  staff: "Take orders and payments. Refunds, voids and staff discounts need a manager's password.",
  manager: "Everything staff can do, plus authorising overrides, the till, reports and most of the admin panel.",
  admin: "Everything a manager can do, plus managing staff accounts and restaurant settings.",
};

export default function StaffAdmin() {
  const { currentStaff } = useAuth();
  const { refreshNow } = useStore();
  const { data, error, reload } = useAdminData<{ staff: StaffRow[] }>("/api/admin/staff");
  const [editing, setEditing] = useState<Partial<StaffRow> | null>(null);
  const [resetFor, setResetFor] = useState<StaffRow | null>(null);
  const [issued, setIssued] = useState<{ name: string; email: string; password: string } | null>(null);
  const m = useMutation();
  const isAdmin = currentStaff?.role === "admin";

  const changed = () => {
    reload();
    refreshNow();
  };

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Each person signs in with their email and their own password. Passwords are stored hashed: they can be reset, never viewed."
        actions={
          isAdmin && (
            <Button variant="primary" onClick={() => setEditing({ role: "staff", active: true })}>
              <Plus size={15} /> Add staff member
            </Button>
          )
        }
      />
      {!isAdmin && <p className="text-sm rounded-lg bg-gold/10 border border-gold/30 px-3 py-2 mb-4">You can view staff as a manager; only an admin can add or change accounts.</p>}
      <ErrorNote error={error || m.error} />
      <Card>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Email</th>
                <th className={th}>Role</th>
                <th className={th}>Last sign-in</th>
                <th className={th}>Status</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {(data?.staff ?? []).map((s) => (
                <tr key={s.id} className={!s.active ? "opacity-50" : ""}>
                  <td className={td}>
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full bg-gold/15 text-gold-dark flex items-center justify-center text-xs font-semibold">{s.initials}</span>
                      <span className="font-medium">{s.name}</span>
                    </div>
                  </td>
                  <td className={`${td} text-xs text-cardamom/70`}>
                    {s.email}
                    {s.phone && <span className="block text-cardamom/45">{s.phone}</span>}
                  </td>
                  <td className={td}>
                    <Badge tone={s.role === "admin" ? "gold" : s.role === "manager" ? "warn" : "neutral"}>{s.role}</Badge>
                  </td>
                  <td className={`${td} text-xs text-cardamom/60`}>{fmtDateTime(s.lastLoginAt)}</td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1">
                      {!s.active ? <Badge>Deactivated</Badge> : s.locked ? <Badge tone="bad">Locked</Badge> : <Badge tone="good">Active</Badge>}
                      {s.active && s.mustChangePassword && <Badge tone="warn">Temporary password</Badge>}
                    </div>
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    {isAdmin && (
                      <>
                        {s.locked && (
                          <Button size="sm" variant="ghost" onClick={async () => (await m.run(() => api(`/api/admin/staff/${s.id}`, { method: "PATCH", body: { unlock: true } }))) && changed()}>
                            <Unlock size={13} /> Unlock
                          </Button>
                        )}
                        {s.id !== currentStaff?.id && (
                          <Button size="sm" variant="ghost" onClick={() => setResetFor(s)}>
                            <KeyRound size={13} /> Reset password
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                          Edit
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-cardamom/45 mt-3">
        Accounts lock for 15 minutes after 5 wrong passwords. New accounts and resets get a temporary password that must be changed at the next sign-in.
      </p>

      {editing && (
        <StaffEditor
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(tempPassword, row) => {
            setEditing(null);
            changed();
            if (tempPassword) setIssued({ name: row.name, email: row.email, password: tempPassword });
          }}
        />
      )}
      {resetFor && (
        <PasswordReset
          row={resetFor}
          onClose={() => setResetFor(null)}
          onSaved={(tempPassword) => {
            setResetFor(null);
            changed();
            if (tempPassword) setIssued({ name: resetFor.name, email: resetFor.email, password: tempPassword });
          }}
        />
      )}
      {issued && <IssuedPassword {...issued} onClose={() => setIssued(null)} />}
    </>
  );
}

function StaffEditor({ row, onClose, onSaved }: { row: Partial<StaffRow>; onClose: () => void; onSaved: (tempPassword: string | undefined, row: { name: string; email: string }) => void }) {
  const [d, setD] = useState({ name: row.name ?? "", initials: row.initials ?? "", role: row.role ?? "staff", email: row.email ?? "", phone: row.phone ?? "", active: row.active ?? true, password: "", ownPassword: false });
  const m = useMutation();
  const isNew = !row.id;
  async function save() {
    if (!d.name.trim()) return m.setError("Enter a name");
    if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) return m.setError("Enter a valid email address");
    let temp: string | undefined;
    const ok = await m.run(async () => {
      if (isNew) {
        const res = await api<{ temporaryPassword?: string }>("/api/admin/staff", {
          body: { name: d.name, initials: d.initials || undefined, role: d.role, email: d.email, phone: d.phone || undefined, password: d.ownPassword ? d.password : undefined },
        });
        temp = res.temporaryPassword;
      } else {
        await api(`/api/admin/staff/${row.id}`, {
          method: "PATCH",
          body: { name: d.name, initials: d.initials || undefined, role: d.role, email: d.email, phone: d.phone || null, active: d.active },
        });
      }
    });
    if (ok) onSaved(temp, { name: d.name, email: d.email.trim().toLowerCase() });
  }
  return (
    <Modal
      title={isNew ? "Add staff member" : `Edit ${row.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={m.busy} onClick={save}>
            {isNew ? "Create account" : "Save"}
          </Button>
        </>
      }
    >
      <ErrorNote error={m.error} />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Full name" className="col-span-2">
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Initials" hint="Auto if blank">
          <Input value={d.initials} maxLength={3} onChange={(e) => setD({ ...d, initials: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Email (used to sign in)" className="col-span-3 sm:col-span-2">
          <Input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
        </Field>
        <Field label="Phone" className="col-span-3 sm:col-span-1">
          <Input value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
        </Field>
        <Field label="Role" className="col-span-3" hint={ROLE_HELP[d.role]}>
          <Select value={d.role} onChange={(e) => setD({ ...d, role: e.target.value as StaffRow["role"] })}>
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        {isNew ? (
          <div className="col-span-3 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={d.ownPassword} onChange={(e) => setD({ ...d, ownPassword: e.target.checked })} />
              Set the temporary password myself (otherwise one is generated)
            </label>
            {d.ownPassword && (
              <Field label="Temporary password" hint="At least 10 characters. They'll be asked to change it when they first sign in.">
                <Input type="text" autoComplete="off" value={d.password} onChange={(e) => setD({ ...d, password: e.target.value })} />
              </Field>
            )}
          </div>
        ) : (
          <label className="col-span-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} />
            Account active (untick when someone leaves; this signs them out and keeps their history)
          </label>
        )}
      </div>
    </Modal>
  );
}

function PasswordReset({ row, onClose, onSaved }: { row: StaffRow; onClose: () => void; onSaved: (tempPassword?: string) => void }) {
  const m = useMutation();
  async function reset() {
    let temp: string | undefined;
    const ok = await m.run(async () => {
      temp = (await api<{ temporaryPassword?: string }>(`/api/admin/staff/${row.id}`, { method: "PATCH", body: { resetPassword: true } })).temporaryPassword;
    });
    if (ok) onSaved(temp);
  }
  return (
    <Modal
      title={`Reset ${row.name}'s password`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" busy={m.busy} onClick={reset}>
            Reset password
          </Button>
        </>
      }
    >
      <ErrorNote error={m.error} />
      <p className="text-sm">This will:</p>
      <ul className="list-disc pl-5 text-sm text-cardamom/70 mt-2 space-y-1">
        <li>sign {row.name.split(" ")[0]} out on every device,</li>
        <li>give you a one-time temporary password to pass on to them in person,</li>
        <li>ask them to choose their own password when they next sign in,</li>
        <li>clear any lockout from wrong passwords.</li>
      </ul>
    </Modal>
  );
}

function IssuedPassword({ name, email, password, onClose }: { name: string; email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Temporary password" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <p className="text-sm text-cardamom/70 mb-4">
        Give this to <strong>{name}</strong> in person. It&apos;s shown only once and must be changed at their next sign-in.
      </p>
      <div className="rounded-xl bg-white border border-cardamom/15 p-4 space-y-2">
        <p className="text-xs text-cardamom/50">Email</p>
        <p className="font-mono text-sm">{email}</p>
        <p className="text-xs text-cardamom/50 pt-1">Temporary password</p>
        <div className="flex items-center gap-2">
          <p className="font-mono text-lg tracking-wide flex-1 select-all">{password}</p>
          <Button
            size="sm"
            onClick={() => {
              navigator.clipboard?.writeText(password).then(() => setCopied(true)).catch(() => {});
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
