import { BRAND } from "./brand";
import type { RestaurantSettings } from "./store";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Receipt header: trading name, address and VAT registration number (a UK VAT receipt
 * must show the supplier's VAT number). Values come from Admin → Settings. */
export function receiptHeaderHtml(settings: RestaurantSettings | null) {
  const heading = settings?.name
    ? `${settings.name}${settings.tagline ? ` — ${settings.tagline}` : ""}`
    : BRAND.receiptHeading;
  const lines = [
    ...(settings?.addressLines ?? []),
    settings?.phone ? `Tel ${settings.phone}` : "",
    settings?.vatNumber ? `VAT Reg. No. ${settings.vatNumber}` : "",
  ].filter(Boolean);
  return `<h1>${esc(heading)}</h1>${
    lines.length ? `<p style="font-size:10px;color:#555;margin:0 0 6px">${lines.map(esc).join("<br/>")}</p>` : ""
  }`;
}

export function receiptFooterHtml(settings: RestaurantSettings | null) {
  return settings?.receiptFooter
    ? `<p style="text-align:center;margin-top:10px;font-size:11px">${esc(settings.receiptFooter)}</p>`
    : "";
}
