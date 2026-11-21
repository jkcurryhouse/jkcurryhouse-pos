// UK postcode → address lookup.
//
// This uses two services:
//
// 1. postcodes.io (https://postcodes.io) — free, no API key, no rate limit
//    for reasonable use. It validates a postcode and returns area info
//    (street-level data is NOT included — Royal Mail's full premises
//    dataset is licensed, so no free API returns "12 Curry Lane" for you).
//
// 2. A pluggable premise-level provider for the actual house/flat + street
//    list ("select your address" dropdown). This ships with a small mock
//    dataset covering a handful of demo postcodes so the feature is fully
//    testable without any account. Swap `fetchPremisesFromProvider` for a
//    real call to getAddress.io, Ideal Postcodes, or Loqate in production —
//    each offers a UK premises-lookup endpoint keyed by postcode. Put the
//    API key in an env var (e.g. NEXT_PUBLIC_ADDRESS_LOOKUP_KEY) and call it
//    from a Next.js API route rather than the client, so the key isn't
//    exposed in the bundle.

export interface PostcodeArea {
  postcode: string;
  town: string; // post town, e.g. "LONDON"
  district: string; // e.g. "Camden"
  region: string;
}

export interface AddressOption {
  /** e.g. "14 Curry Lane" */
  addressLine1: string;
  /** e.g. "Curry Lane" */
  street: string;
}

function normalisePostcode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Formats a compact postcode ("N19QT") into the standard "N1 9QT" form. */
export function formatPostcode(raw: string): string {
  const compact = normalisePostcode(raw);
  if (compact.length < 5) return raw.trim().toUpperCase();
  const outward = compact.slice(0, -3);
  const inward = compact.slice(-3);
  return `${outward} ${inward}`;
}

const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;

export function isValidUkPostcode(raw: string): boolean {
  return UK_POSTCODE_RE.test(raw.trim());
}

/**
 * Validates the postcode and returns its post town / district via
 * postcodes.io. Returns null for a postcode that doesn't exist.
 */
export async function lookupPostcodeArea(raw: string): Promise<PostcodeArea | null> {
  const postcode = formatPostcode(raw);
  if (!isValidUkPostcode(postcode)) return null;

  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 200 || !json.result) return null;
    return {
      postcode: json.result.postcode,
      town: json.result.post_town ?? json.result.admin_ward ?? "",
      district: json.result.admin_district ?? "",
      region: json.result.region ?? "",
    };
  } catch {
    return null;
  }
}

// --- Mock premises dataset (demo only — replace with a real provider) ----

const MOCK_PREMISES: Record<string, { street: string; houses: string[] }> = {
  "N19QT": { street: "Curry Lane", houses: ["12", "14", "16", "18", "Flat 1, 20", "Flat 2, 20"] },
  "SW1A1AA": { street: "Downing Street", houses: ["10", "11", "12"] },
  "M11AE": { street: "Corporation Street", houses: ["1", "3", "5", "7"] },
  "B11AA": { street: "Colmore Row", houses: ["2", "4", "6", "8"] },
};

async function fetchPremisesFromProvider(
  postcode: string
): Promise<{ street: string; houses: string[] } | null> {
  // --- Swap-in point for a real provider, e.g. getAddress.io: ---
  // const res = await fetch(
  //   `https://api.getaddress.io/find/${encodeURIComponent(postcode)}?api-key=${process.env.NEXT_PUBLIC_ADDRESS_LOOKUP_KEY}`
  // );
  // const json = await res.json();
  // return { street: ..., houses: json.addresses.map(...) };

  const compact = normalisePostcode(postcode);
  return MOCK_PREMISES[compact] ?? null;
}

/**
 * Returns every address at a postcode, e.g. for a "select your address"
 * list. Falls back to a single freeform entry (street left blank for the
 * person to fill in) when the postcode is valid but has no premises match
 * in the demo dataset — keeps the flow usable for any real UK postcode
 * while a production provider isn't wired up yet.
 */
export async function lookupAddressesForPostcode(raw: string): Promise<{
  postcode: string;
  town: string;
  options: AddressOption[];
} | null> {
  const area = await lookupPostcodeArea(raw);
  if (!area) return null;

  const premises = await fetchPremisesFromProvider(area.postcode);
  if (premises) {
    return {
      postcode: area.postcode,
      town: area.town,
      options: premises.houses.map((house) => ({
        addressLine1: `${house} ${premises.street}`,
        street: premises.street,
      })),
    };
  }

  // No premises data for this postcode in the demo dataset — still a valid,
  // real postcode, so let the person type the house number/name manually.
  return {
    postcode: area.postcode,
    town: area.town,
    options: [],
  };
}
