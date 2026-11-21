"use client";

import { useState } from "react";
import { MenuItem } from "@/lib/types";
import { AllergenTags } from "./AllergenTags";
import { ItemModifierSheet } from "./ItemModifierSheet";
import { useStore } from "@/lib/store";
import { Flame, PlusCircle } from "lucide-react";

export function MenuGrid({ items }: { items: MenuItem[] }) {
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const { addDraftLine } = useStore();

  function handleTap(item: MenuItem) {
    if (item.isOutOfStock) return;
    const needsConfig =
      (item.modifierGroups && item.modifierGroups.length > 0) ||
      (item.spiceLevelOptions && item.spiceLevelOptions.length > 0);
    if (needsConfig) {
      setActiveItem(item);
    } else {
      addDraftLine({ menuItem: item, quantity: 1, modifiers: [] });
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => handleTap(item)}
            disabled={item.isOutOfStock}
            className={`text-left rounded-xl border p-3.5 bg-white transition-all relative overflow-hidden ${
              item.isOutOfStock
                ? "opacity-45 cursor-not-allowed border-cardamom/10"
                : "border-cardamom/10 hover:border-gold/50 hover:shadow-ticket active:scale-[0.98]"
            }`}
          >
            {item.isTodaysSpecial && !item.isOutOfStock && (
              <span className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gold-dark bg-gold/15 px-1.5 py-0.5 rounded">
                <Flame size={11} /> Special
              </span>
            )}
            {item.isOutOfStock && (
              <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wide text-chili bg-chili/10 px-1.5 py-0.5 rounded">
                86&apos;d
              </span>
            )}
            <h3 className="font-display text-base leading-snug pr-2">{item.name}</h3>
            {item.description && (
              <p className="text-xs text-cardamom/55 mt-1 line-clamp-2">{item.description}</p>
            )}
            <div className="mt-2 min-h-[20px]">
              <AllergenTags allergens={item.allergens} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="font-semibold tabular-nums">£{item.price.toFixed(2)}</span>
              {!item.isOutOfStock && (
                <PlusCircle size={20} className="text-onyx/70" />
              )}
            </div>
          </button>
        ))}
      </div>

      {activeItem && (
        <ItemModifierSheet item={activeItem} onClose={() => setActiveItem(null)} />
      )}
    </>
  );
}
