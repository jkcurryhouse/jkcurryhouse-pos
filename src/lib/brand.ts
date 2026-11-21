// Single source of truth for customer-facing brand copy (screens, receipts, manifest).
// Internal identifiers such as RESTAURANT_ID and localStorage keys are intentionally
// NOT derived from this, so renaming the brand never orphans stored or shared data.
export const BRAND = {
  shortName: "JK Curryhouse",
  legalName: "JK Curryhouse",
  tagline: "The Real Indian Kitchen",
  /** Used as the heading on printed receipts and reports. */
  receiptHeading: "JK Curryhouse — The Real Indian Kitchen",
} as const;
