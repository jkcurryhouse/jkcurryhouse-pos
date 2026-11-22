"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Archive, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { allergenLabels } from "@/lib/mock-data";
import type { MenuItem, ModifierGroup } from "@/lib/types";
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
  Toggle,
  gbp,
  td,
  th,
  useAdminData,
  useMutation,
} from "@/components/admin/ui";

interface Category {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  itemCount: number;
}

const ALLERGENS = Object.keys(allergenLabels);
const label = (a: string) => allergenLabels[a] ?? a.charAt(0).toUpperCase() + a.slice(1);
const SPICE = ["mild", "medium", "hot", "extra-hot"] as const;
const DIETARY = ["vegetarian", "vegan", "spicy", "halal", "gluten-free"];

type Draft = {
  id?: string;
  name: string;
  description: string;
  price: string;
  categoryId: string;
  allergens: string[];
  dietary: string[];
  spiceLevelOptions: string[];
  modifierGroups: ModifierGroup[];
  isTodaysSpecial: boolean;
  isOutOfStock: boolean;
  availablePos: boolean;
  availableOnline: boolean;
  calories: string;
  imageUrl: string;
};

function toDraft(m?: MenuItem, categoryId = ""): Draft {
  return {
    id: m?.id,
    name: m?.name ?? "",
    description: m?.description ?? "",
    price: m ? m.price.toFixed(2) : "",
    categoryId: m?.categoryId ?? categoryId,
    allergens: m?.allergens ?? [],
    dietary: m?.dietary ?? [],
    spiceLevelOptions: m?.spiceLevelOptions ?? [],
    modifierGroups: m?.modifierGroups ?? [],
    isTodaysSpecial: !!m?.isTodaysSpecial,
    isOutOfStock: !!m?.isOutOfStock,
    availablePos: m?.availablePos ?? true,
    availableOnline: m?.availableOnline ?? true,
    calories: m?.calories != null ? String(m.calories) : "",
    imageUrl: m?.imageUrl ?? "",
  };
}

export default function MenuAdmin() {
  const items = useAdminData<{ items: MenuItem[] }>("/api/admin/menu-items");
  const cats = useAdminData<{ categories: Category[] }>("/api/admin/categories");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [catFilter, setCatFilter] = useState("all");
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const m = useMutation();

  const categories = useMemo(() => cats.data?.categories ?? [], [cats.data]);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  const visible = useMemo(() => {
    let list = items.data?.items ?? [];
    if (!showArchived) list = list.filter((i) => !i.archived);
    else list = list.filter((i) => i.archived);
    if (catFilter !== "all") list = list.filter((i) => i.categoryId === catFilter);
    if (q.trim()) list = list.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
    const order = new Map(categories.map((c, i) => [c.id, i]));
    return [...list].sort(
      (a, b) => (order.get(a.categoryId) ?? 99) - (order.get(b.categoryId) ?? 99) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    );
  }, [items.data, catFilter, q, showArchived, categories]);

  async function quick(item: MenuItem, patch: Record<string, unknown>) {
    const ok = await m.run(() => api(`/api/admin/menu-items/${item.id}`, { method: "PATCH", body: patch }));
    if (ok) items.reload();
  }

  return (
    <>
      <PageHeader
        title="Menu"
        subtitle="One menu for the website and the POS — changes show on every till within seconds and on the website straight away."
        actions={
          <>
            <Button variant="primary" onClick={() => setEditing(toDraft(undefined, catFilter !== "all" ? catFilter : categories[0]?.id))}>
              <Plus size={15} /> New item
            </Button>
          </>
        }
      />
      <ErrorNote error={items.error || cats.error || m.error} />

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <Input placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} className="!w-56" />
        <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="!w-48">
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {!c.active ? " (hidden)" : ""}
            </option>
          ))}
        </Select>
        <Toggle checked={showArchived} onChange={setShowArchived} label="Show archived" />
      </div>

      <Card>
        <div className="overflow-x-auto -mx-5">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Item</th>
                <th className={th}>Category</th>
                <th className={`${th} text-right`}>Price</th>
                <th className={th}>Allergens</th>
                <th className={th}>In stock</th>
                <th className={th}>Chef&apos;s pick</th>
                <th className={th}>Sold on</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => (
                <tr key={i.id} className={i.isOutOfStock ? "bg-chili/[0.03]" : ""}>
                  <td className={td}>
                    <p className="font-medium">{i.name}</p>
                    {i.description && <p className="text-xs text-cardamom/45 line-clamp-1 max-w-xs">{i.description}</p>}
                    {(i.modifierGroups?.length || i.spiceLevelOptions?.length) && (
                      <p className="text-[11px] text-cardamom/40">
                        {[i.spiceLevelOptions?.length && "spice levels", i.modifierGroups?.length && `${i.modifierGroups.length} option group(s)`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </td>
                  <td className={`${td} text-cardamom/60`}>{catName(i.categoryId)}</td>
                  <td className={`${td} text-right tabular-nums font-semibold`}>{gbp(i.price)}</td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {i.allergens.length === 0 ? (
                        <span className="text-xs text-cardamom/35">None declared</span>
                      ) : (
                        i.allergens.map((a) => <Badge key={a} tone="bad">{label(a)}</Badge>)
                      )}
                    </div>
                  </td>
                  <td className={td}>
                    <Toggle checked={!i.isOutOfStock} onChange={(v) => quick(i, { isOutOfStock: !v })} label="" />
                  </td>
                  <td className={td}>
                    <Toggle checked={!!i.isTodaysSpecial} onChange={(v) => quick(i, { isTodaysSpecial: v })} label="" />
                  </td>
                  <td className={`${td} text-xs`}>
                    <div className="flex gap-1">
                      {i.availablePos !== false && <Badge>POS</Badge>}
                      {i.availableOnline !== false && <Badge>Web</Badge>}
                    </div>
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    {i.archived ? (
                      <Button size="sm" onClick={() => quick(i, { active: true })}>
                        <RotateCcw size={13} /> Restore
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(toDraft(i))} aria-label={`Edit ${i.name}`}>
                          <Pencil size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Archive ${i.name}`}
                          onClick={async () => {
                            if (!confirm(`Archive "${i.name}"? It disappears from the POS and website but stays on past orders.`)) return;
                            if (await m.run(() => api(`/api/admin/menu-items/${i.id}`, { method: "DELETE" }))) items.reload();
                          }}
                        >
                          <Archive size={14} />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-cardamom/40`} colSpan={8}>
                    {items.loading ? "Loading…" : "No items match."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <ItemEditor
          draft={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            items.reload();
            cats.reload();
          }}
        />
      )}
    </>
  );
}

function ItemEditor({
  draft,
  categories,
  onClose,
  onSaved,
}: {
  draft: Draft;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<Draft>(draft);
  const m = useMutation();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const toggleIn = (k: "allergens" | "dietary" | "spiceLevelOptions", v: string) =>
    set(k, d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v]);

  async function save() {
    const price = Number(d.price);
    if (!d.name.trim()) return m.setError("Name is required");
    if (!Number.isFinite(price) || price < 0) return m.setError("Enter a valid price");
    const body = {
      name: d.name,
      description: d.description,
      price,
      categoryId: d.categoryId,
      allergens: d.allergens,
      dietary: d.dietary,
      spiceLevelOptions: d.spiceLevelOptions,
      modifierGroups: d.modifierGroups.map((g) => ({
        ...g,
        options: g.options.map((o) => ({ ...o, priceDelta: Number(o.priceDelta) || 0 })),
      })),
      isTodaysSpecial: d.isTodaysSpecial,
      isOutOfStock: d.isOutOfStock,
      availablePos: d.availablePos,
      availableOnline: d.availableOnline,
      calories: d.calories ? Number(d.calories) : null,
      imageUrl: d.imageUrl.trim() || null,
    };
    const ok = await m.run(() =>
      d.id
        ? api(`/api/admin/menu-items/${d.id}`, { method: "PATCH", body })
        : api(`/api/admin/menu-items`, { method: "POST", body })
    );
    if (ok) onSaved();
  }

  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || `opt-${Date.now()}`;

  return (
    <Modal
      wide
      title={d.id ? `Edit ${draft.name}` : "New menu item"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={m.busy} onClick={save}>
            Save item
          </Button>
        </>
      }
    >
      <ErrorNote error={m.error} />
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Name">
          <Input value={d.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (£, inc. VAT)">
            <Input inputMode="decimal" value={d.price} onChange={(e) => set("price", e.target.value.replace(/[^0-9.]/g, ""))} />
          </Field>
          <Field label="Calories (kcal)" hint="Optional">
            <Input inputMode="numeric" value={d.calories} onChange={(e) => set("calories", e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
        <Field label="Description" className="sm:col-span-2">
          <Input value={d.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label="Photo URL" className="sm:col-span-2" hint="Shown on the website. Upload photos in the website admin, or paste an image link.">
          <Input value={d.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Category">
          <Select value={d.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-col gap-2 justify-end">
          <Toggle checked={d.availablePos} onChange={(v) => set("availablePos", v)} label="Sold in restaurant (POS)" />
          <Toggle checked={d.availableOnline} onChange={(v) => set("availableOnline", v)} label="Sold on website" />
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold text-cardamom/65 mb-1.5">
          Allergens <span className="font-normal text-cardamom/45">— the 14 UK regulated allergens (Natasha&apos;s Law). Shown on the POS, KDS tickets and website.</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ALLERGENS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => toggleIn("allergens", a)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                d.allergens.includes(a) ? "bg-chili text-ivory border-chili" : "bg-white border-cardamom/15 text-cardamom/60"
              }`}
            >
              {label(a)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mt-5">
        <div>
          <p className="text-xs font-semibold text-cardamom/65 mb-1.5">Dietary</p>
          <div className="flex flex-wrap gap-1.5">
            {DIETARY.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => toggleIn("dietary", a)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${
                  d.dietary.includes(a) ? "bg-jade text-ivory border-jade" : "bg-white border-cardamom/15 text-cardamom/60"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-cardamom/65 mb-1.5">Spice levels offered</p>
          <div className="flex flex-wrap gap-1.5">
            {SPICE.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => toggleIn("spiceLevelOptions", a)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${
                  d.spiceLevelOptions.includes(a) ? "bg-onyx text-ivory border-onyx" : "bg-white border-cardamom/15 text-cardamom/60"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-6 mt-5">
        <Toggle checked={d.isTodaysSpecial} onChange={(v) => set("isTodaysSpecial", v)} label="Chef's pick (highlighted)" />
        <Toggle checked={d.isOutOfStock} onChange={(v) => set("isOutOfStock", v)} label="Out of stock (POS + website)" />
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-cardamom/65">Options &amp; add-ons</p>
          <Button
            size="sm"
            onClick={() =>
              set("modifierGroups", [
                ...d.modifierGroups,
                { id: `group-${d.modifierGroups.length + 1}`, label: "", required: false, multiSelect: false, options: [{ id: "option-1", label: "", priceDelta: 0 }] },
              ])
            }
          >
            <Plus size={13} /> Add option group
          </Button>
        </div>
        {d.modifierGroups.length === 0 && <p className="text-xs text-cardamom/40">No options — e.g. add &quot;Dip&quot; with Mint / Mango (+£0.50).</p>}
        <div className="space-y-3">
          {d.modifierGroups.map((g, gi) => {
            const updateGroup = (patch: Partial<ModifierGroup>) =>
              set("modifierGroups", d.modifierGroups.map((x, i) => (i === gi ? { ...x, ...patch } : x)));
            return (
              <div key={gi} className="rounded-xl border border-cardamom/10 bg-white p-3">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <Input
                    placeholder="Group name, e.g. Dip"
                    value={g.label}
                    onChange={(e) => updateGroup({ label: e.target.value, id: d.id && g.label ? g.id : slug(e.target.value) })}
                    className="!w-52"
                  />
                  <Toggle checked={g.required} onChange={(v) => updateGroup({ required: v })} label="Required" />
                  <Toggle checked={g.multiSelect} onChange={(v) => updateGroup({ multiSelect: v })} label="Pick several" />
                  <button
                    className="ml-auto text-cardamom/40 hover:text-chili"
                    onClick={() => set("modifierGroups", d.modifierGroups.filter((_, i) => i !== gi))}
                    aria-label="Remove group"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {g.options.map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2 mb-1.5">
                    <Input
                      placeholder="Option"
                      value={o.label}
                      onChange={(e) =>
                        updateGroup({
                          options: g.options.map((x, i) =>
                            i === oi ? { ...x, label: e.target.value, id: d.id && o.label ? x.id : slug(e.target.value) } : x
                          ),
                        })
                      }
                    />
                    <span className="text-xs text-cardamom/50 whitespace-nowrap shrink-0">+ £</span>
                    <Input
                      className="!w-24"
                      inputMode="decimal"
                      value={String(o.priceDelta)}
                      onChange={(e) =>
                        updateGroup({
                          options: g.options.map((x, i) =>
                            i === oi ? { ...x, priceDelta: e.target.value.replace(/[^0-9.-]/g, "") as unknown as number } : x
                          ),
                        })
                      }
                    />
                    <button
                      className="text-cardamom/40 hover:text-chili"
                      onClick={() => updateGroup({ options: g.options.filter((_, i) => i !== oi) })}
                      aria-label="Remove option"
                      disabled={g.options.length === 1}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  className="text-xs underline text-cardamom/55"
                  onClick={() => updateGroup({ options: [...g.options, { id: `option-${g.options.length + 1}`, label: "", priceDelta: 0 }] })}
                >
                  + Add option
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-cardamom/40 mt-2">
          Option ids are kept once saved, so renaming an option doesn&apos;t affect past orders.
        </p>
      </div>
    </Modal>
  );
}
