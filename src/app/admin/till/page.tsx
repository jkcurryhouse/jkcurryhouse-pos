"use client";

import { Fragment, useState } from "react";
import type { TillSession } from "@/lib/types";
import { useStore } from "@/lib/store";
import { Badge, Card, ErrorNote, PageHeader, fmtDateTime, gbp, td, th, useAdminData } from "@/components/admin/ui";

type Session = TillSession & { cashTaken: number; cardTaken: number; orders: number; discrepancy: number | null };

export default function TillHistory() {
  const { staffNameById } = useStore();
  const { data, error } = useAdminData<{ sessions: Session[] }>("/api/admin/till-sessions?limit=100");
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Till history" subtitle="Every till session: float, cash in/out, expected vs counted cash. Open and close the till from the POS Till screen." />
      <ErrorNote error={error} />
      <Card>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Opened</th>
                <th className={th}>Closed</th>
                <th className={`${th} text-right`}>Float</th>
                <th className={`${th} text-right`}>Cash</th>
                <th className={`${th} text-right`}>Card</th>
                <th className={`${th} text-right`}>Expected</th>
                <th className={`${th} text-right`}>Counted</th>
                <th className={th}>Result</th>
              </tr>
            </thead>
            <tbody>
              {(data?.sessions ?? []).map((s) => (
                <Fragment key={s.id}>
                  <tr className="cursor-pointer hover:bg-gold/5" onClick={() => setOpen(open === s.id ? null : s.id)}>
                    <td className={`${td} text-xs`}>{fmtDateTime(s.openedAt)}<span className="block text-cardamom/45">{staffNameById(s.openedByStaffId)}</span></td>
                    <td className={`${td} text-xs`}>{s.closedAt ? <>{fmtDateTime(s.closedAt)}<span className="block text-cardamom/45">{staffNameById(s.closedByStaffId)}</span></> : <Badge tone="good">Open now</Badge>}</td>
                    <td className={`${td} text-right tabular-nums`}>{gbp(s.openingFloat)}</td>
                    <td className={`${td} text-right tabular-nums`}>{gbp(s.cashTaken)}</td>
                    <td className={`${td} text-right tabular-nums`}>{gbp(s.cardTaken)}</td>
                    <td className={`${td} text-right tabular-nums`}>{s.expectedCash != null ? gbp(s.expectedCash) : "—"}</td>
                    <td className={`${td} text-right tabular-nums`}>{s.countedCash != null ? gbp(s.countedCash) : "—"}</td>
                    <td className={td}>
                      {s.discrepancy == null ? "—" : Math.abs(s.discrepancy) < 0.01 ? <Badge tone="good">Balanced</Badge> : <Badge tone="bad">{s.discrepancy > 0 ? "Over" : "Short"} {gbp(Math.abs(s.discrepancy))}</Badge>}
                    </td>
                  </tr>
                  {open === s.id && (
                    <tr>
                      <td colSpan={8} className="bg-ivory px-5 py-3 text-xs">
                        <p className="font-semibold mb-1">Cash movements</p>
                        {s.cashMovements.length === 0 ? <p className="text-cardamom/45">None</p> : (
                          <ul className="space-y-0.5">
                            {s.cashMovements.map((m) => (
                              <li key={m.id}>{fmtDateTime(m.at)} · {m.type === "in" ? "In" : "Out"} {gbp(m.amount)} — {m.reason} · {staffNameById(m.staffId)}</li>
                            ))}
                          </ul>
                        )}
                        {s.notes && <p className="mt-2">Notes: {s.notes}</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {data && data.sessions.length === 0 && <tr><td colSpan={8} className={`${td} text-center text-cardamom/40`}>No till sessions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
