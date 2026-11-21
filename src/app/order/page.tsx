"use client";

import { useMemo, useState } from "react";
import { categories, menuItems } from "@/lib/mock-data";
import { MenuGrid } from "@/components/MenuGrid";
import { CartPanel } from "@/components/CartPanel";
import { TopBar } from "@/components/TopBar";
import { OfflineBanner } from "@/components/OfflineBanner";
import { RequireAuth } from "@/components/RequireAuth";
import { useStore } from "@/lib/store";
import { Search, ShoppingBag, X } from "lucide-react";

function OrderScreen() {
  const [activeCategory, setActiveCategory] = useState(categories[0].id);
  const [query, setQuery] = useState("");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const { menuItems: liveMenuItems, draftLines } = useStore();

  const items = liveMenuItems.length ? liveMenuItems : menuItems;

  const filtered = useMemo(() => {
    const byCategory = items.filter((i) => i.categoryId === activeCategory);
    if (!query.trim()) return byCategory;
    const q = query.toLowerCase();
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
    );
  }, [items, activeCategory, query]);

  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <OfflineBanner />
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 sm:px-6 pt-4 pb-2 shrink-0">
            <div className="relative mb-3">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-cardamom/35"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the menu"
                className="w-full rounded-lg border border-cardamom/15 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-gold/60"
              />
            </div>
            {!query.trim() && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveCategory(c.id)}
                    className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                      activeCategory === c.id
                        ? "bg-gold text-onyx"
                        : "bg-white border border-cardamom/15 text-cardamom/70 hover:border-gold/40"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6">
            <MenuGrid items={filtered} />
          </div>
        </div>
        <div className="w-[340px] shrink-0 hidden md:block">
          <CartPanel />
        </div>
      </div>

      {draftLines.length > 0 && (
        <button
          onClick={() => setMobileCartOpen(true)}
          className="md:hidden fixed bottom-4 left-4 right-4 z-30 rounded-xl bg-chili text-ivory font-semibold py-3.5 shadow-ticket flex items-center justify-center gap-2"
        >
          <ShoppingBag size={18} />
          View order · {draftLines.reduce((s, l) => s + l.quantity, 0)} items
        </button>
      )}

      {mobileCartOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col bg-ivory">
          <div className="flex items-center justify-between h-14 px-4 border-b border-cardamom/10 shrink-0">
            <span className="font-display text-lg">Current order</span>
            <button
              onClick={() => setMobileCartOpen(false)}
              className="p-2 rounded-full hover:bg-cardamom/5"
              aria-label="Close order"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <CartPanel />
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrderPage() {
  return (
    <RequireAuth>
      <OrderScreen />
    </RequireAuth>
  );
}
