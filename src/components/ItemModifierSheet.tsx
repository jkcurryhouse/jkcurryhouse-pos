"use client";

import { useMemo, useState } from "react";
import { MenuItem, SelectedModifier, SpiceLevel } from "@/lib/types";
import { useStore } from "@/lib/store";
import { AllergenTags } from "./AllergenTags";
import { X, Minus, Plus } from "lucide-react";

const SPICE_LABEL: Record<SpiceLevel, string> = {
  mild: "Mild",
  medium: "Medium",
  hot: "Hot",
  "extra-hot": "Extra Hot",
};

export function ItemModifierSheet({
  item,
  onClose,
}: {
  item: MenuItem;
  onClose: () => void;
}) {
  const { addDraftLine } = useStore();
  const [spiceLevel, setSpiceLevel] = useState<SpiceLevel | undefined>(
    item.spiceLevelOptions?.[1] ?? item.spiceLevelOptions?.[0]
  );
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const modifiers: SelectedModifier[] = useMemo(() => {
    const out: SelectedModifier[] = [];
    for (const group of item.modifierGroups ?? []) {
      const chosen = selectedOptions[group.id] ?? [];
      for (const optId of chosen) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt) {
          out.push({
            groupId: group.id,
            groupLabel: group.label,
            optionId: opt.id,
            optionLabel: opt.label,
            priceDelta: opt.priceDelta,
          });
        }
      }
    }
    return out;
  }, [selectedOptions, item.modifierGroups]);

  const unitTotal = item.price + modifiers.reduce((s, m) => s + m.priceDelta, 0);
  const missingRequired = (item.modifierGroups ?? [])
    .filter((g) => g.required)
    .some((g) => !(selectedOptions[g.id]?.length > 0));

  function toggleOption(groupId: string, optionId: string, multi: boolean) {
    setSelectedOptions((prev) => {
      const current = prev[groupId] ?? [];
      if (multi) {
        const next = current.includes(optionId)
          ? current.filter((o) => o !== optionId)
          : [...current, optionId];
        return { ...prev, [groupId]: next };
      }
      return { ...prev, [groupId]: current.includes(optionId) ? [] : [optionId] };
    });
  }

  function handleAdd() {
    addDraftLine({
      menuItem: item,
      quantity,
      spiceLevel,
      modifiers,
      notes: notes.trim() || undefined,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-cardamom/50"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl bg-ivory shadow-ticket max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-cardamom/10">
          <div>
            <h2 className="font-display text-xl leading-tight">{item.name}</h2>
            {item.description && (
              <p className="text-sm text-cardamom/60 mt-1">{item.description}</p>
            )}
            <div className="mt-2">
              <AllergenTags allergens={item.allergens} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-2 hover:bg-cardamom/5 active:bg-cardamom/10"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5 flex-1">
          {item.spiceLevelOptions && item.spiceLevelOptions.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-cardamom/50 mb-2">
                Spice level
              </div>
              <div className="flex flex-wrap gap-2">
                {item.spiceLevelOptions.map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setSpiceLevel(lvl)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      spiceLevel === lvl
                        ? "bg-chili text-ivory border-chili"
                        : "bg-white border-cardamom/15 text-cardamom/80 hover:border-chili/40"
                    }`}
                  >
                    {SPICE_LABEL[lvl]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(item.modifierGroups ?? []).map((group) => (
            <div key={group.id}>
              <div className="text-xs font-semibold uppercase tracking-wide text-cardamom/50 mb-2">
                {group.label}
                {group.required && <span className="text-chili"> · required</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {group.options.map((opt) => {
                  const active = (selectedOptions[group.id] ?? []).includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleOption(group.id, opt.id, group.multiSelect)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        active
                          ? "bg-gold text-onyx border-gold"
                          : "bg-white border-cardamom/15 text-cardamom/80 hover:border-gold/50"
                      }`}
                    >
                      {opt.label}
                      {opt.priceDelta > 0 && (
                        <span className="opacity-75"> +£{opt.priceDelta.toFixed(2)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-cardamom/50 mb-2">
              Notes for kitchen
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. no coriander, allergy — nut-free prep"
              rows={2}
              className="w-full rounded-lg border border-cardamom/15 bg-white px-3 py-2 text-sm outline-none focus:border-gold/60"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-cardamom/50">
              Quantity
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-full border border-cardamom/20 flex items-center justify-center active:bg-cardamom/10"
              >
                <Minus size={16} />
              </button>
              <span className="w-6 text-center font-semibold tabular-nums">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="w-10 h-10 rounded-full border border-cardamom/20 flex items-center justify-center active:bg-cardamom/10"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-cardamom/10">
          <button
            disabled={missingRequired}
            onClick={handleAdd}
            className="w-full rounded-xl bg-onyx text-ivory font-semibold py-3.5 text-base disabled:opacity-40 disabled:pointer-events-none active:bg-onyx-dark transition-colors flex items-center justify-center gap-2"
          >
            Add to order · £{(unitTotal * quantity).toFixed(2)}
          </button>
          {missingRequired && (
            <p className="text-xs text-chili mt-2 text-center">
              Choose a required option to continue
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
