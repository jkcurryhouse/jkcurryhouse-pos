"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { CustomerContactSnapshot } from "@/lib/types";
import { lookupAddressesForPostcode, AddressOption } from "@/lib/postcode";
import { X, User, Search, MapPin, Loader2, CheckCircle2 } from "lucide-react";

export function CustomerDetailsModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (details: CustomerContactSnapshot) => void;
}) {
  const { draftCustomer, findCustomerByPhone } = useStore();

  const [name, setName] = useState(draftCustomer?.name ?? "");
  const [phone, setPhone] = useState(draftCustomer?.phone ?? "");
  const [postcode, setPostcode] = useState(draftCustomer?.postcode ?? "");
  const [town, setTown] = useState(draftCustomer?.town ?? "");
  const [options, setOptions] = useState<AddressOption[]>([]);
  const [selected, setSelected] = useState<AddressOption | null>(
    draftCustomer ? { addressLine1: draftCustomer.addressLine1, street: draftCustomer.street } : null
  );
  const [manualAddress, setManualAddress] = useState(draftCustomer?.addressLine1 ?? "");
  const [manualStreet, setManualStreet] = useState(draftCustomer?.street ?? "");
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "notfound">("idle");

  const returningCustomer = phone.trim().length >= 7 ? findCustomerByPhone(phone) : undefined;

  async function runLookup() {
    if (!postcode.trim()) return;
    setLookupState("loading");
    setOptions([]);
    setSelected(null);
    const result = await lookupAddressesForPostcode(postcode);
    if (!result) {
      setLookupState("notfound");
      return;
    }
    setPostcode(result.postcode);
    setTown(result.town);
    setOptions(result.options);
    setLookupState("idle");
  }

  const usingManualAddress = options.length === 0 && lookupState !== "loading";
  const addressLine1 = selected ? selected.addressLine1 : manualAddress;
  const street = selected ? selected.street : manualStreet;

  const canSave =
    name.trim().length > 0 &&
    phone.trim().length >= 7 &&
    postcode.trim().length > 0 &&
    addressLine1.trim().length > 0 &&
    street.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      phone: phone.trim(),
      postcode: postcode.trim().toUpperCase(),
      addressLine1: addressLine1.trim(),
      street: street.trim(),
      town: town.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button className="absolute inset-0 bg-cardamom/50" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl bg-ivory shadow-ticket p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl flex items-center gap-2">
            <User size={18} /> Customer details
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-cardamom/5">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-cardamom/50 uppercase tracking-wide">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="mt-1 w-full rounded-lg border border-cardamom/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold/60"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-cardamom/50 uppercase tracking-wide">
              Phone number
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07700 900123"
              inputMode="tel"
              className="mt-1 w-full rounded-lg border border-cardamom/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold/60"
            />
            {returningCustomer && (
              <p className="text-xs text-jade-dark mt-1 flex items-center gap-1">
                <CheckCircle2 size={12} />
                Returning customer · {returningCustomer.orderCount} order
                {returningCustomer.orderCount === 1 ? "" : "s"} · try the REGULAR5 promo code
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-cardamom/50 uppercase tracking-wide">
              Postcode
            </label>
            <div className="mt-1 flex gap-2">
              <input
                value={postcode}
                onChange={(e) => {
                  setPostcode(e.target.value);
                  setLookupState("idle");
                  setOptions([]);
                  setSelected(null);
                }}
                placeholder="e.g. N1 9QT"
                className="flex-1 rounded-lg border border-cardamom/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold/60 uppercase"
              />
              <button
                onClick={runLookup}
                disabled={!postcode.trim() || lookupState === "loading"}
                className="shrink-0 flex items-center gap-1.5 rounded-lg bg-onyx text-ivory px-3 text-sm font-semibold disabled:opacity-30"
              >
                {lookupState === "loading" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Search size={14} />
                )}
                Find
              </button>
            </div>
            {lookupState === "notfound" && (
              <p className="text-chili text-xs mt-1.5">
                Postcode not recognised — check and try again.
              </p>
            )}
            {town && <p className="text-xs text-cardamom/45 mt-1">{town}</p>}
          </div>

          {options.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-cardamom/50 uppercase tracking-wide">
                Select address
              </label>
              <div className="mt-1 space-y-1.5 max-h-40 overflow-y-auto">
                {options.map((opt) => (
                  <button
                    key={opt.addressLine1}
                    onClick={() => setSelected(opt)}
                    className={`w-full flex items-center gap-2 text-left rounded-lg border px-3 py-2 text-sm ${
                      selected?.addressLine1 === opt.addressLine1
                        ? "bg-onyx text-ivory border-onyx"
                        : "bg-white border-cardamom/15 text-cardamom/70"
                    }`}
                  >
                    <MapPin size={13} className="shrink-0" />
                    {opt.addressLine1}
                  </button>
                ))}
              </div>
            </div>
          )}

          {usingManualAddress && postcode.trim() && lookupState !== "notfound" && (
            <div className="space-y-3">
              <p className="text-xs text-cardamom/45">
                No saved addresses for this postcode — enter it manually.
              </p>
              <div>
                <label className="text-xs font-semibold text-cardamom/50 uppercase tracking-wide">
                  House number/name
                </label>
                <input
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  placeholder="e.g. 14"
                  className="mt-1 w-full rounded-lg border border-cardamom/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold/60"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-cardamom/50 uppercase tracking-wide">
                  Street
                </label>
                <input
                  value={manualStreet}
                  onChange={(e) => setManualStreet(e.target.value)}
                  placeholder="e.g. Curry Lane"
                  className="mt-1 w-full rounded-lg border border-cardamom/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-gold/60"
                />
              </div>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full mt-2 rounded-xl bg-chili text-ivory font-semibold py-3 disabled:opacity-30"
          >
            Save customer details
          </button>
          <p className="text-[11px] text-cardamom/40 text-center leading-snug">
            Used for this order&apos;s delivery/receipt and, only for orders taken here, to recognise
            returning customers for offers. GDPR: not used for marketing without separate consent.
          </p>
        </div>
      </div>
    </div>
  );
}
