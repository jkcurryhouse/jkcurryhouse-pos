# JK Curryhouse POS — Iterations 1–7

Staff terminal prototype for JK Curryhouse (The Real Indian Kitchen)'s point-of-sale system.

## What's in this build

**Iteration 1 — order taking + kitchen display**, running against an in-memory/localStorage
mock of the shared menu and orders database:
- Touch-optimised order screen: categories → items → modifiers/spice level, search, cart/ticket panel
- Dine-in / takeaway / delivery order types, table number for dine-in
- Today's Special and out-of-stock ("86'd") indicators, allergen tags on every item
- Orders write to a single shared order list tagged POS/online — one unified queue
- Kitchen Display System: live Pending → Preparing → Ready → Served board, per-item status
  progression, delayed/unavailable flags, and an elapsed-time warning past a threshold
- A "simulate incoming website order" button on the KDS to demonstrate the combined queue

**Iteration 2 — staff authentication + payments**, closing the loop from taking an order to
getting paid:
- PIN-based staff login (mock Cognito), staff vs manager roles, quick account switching for
  shift handovers, auto-logout after 10 minutes of inactivity
- A demo toggle on the login screen simulating the "blocked — off-site network" message the
  real IP-allowlisted WAF would show
- `/payments` screen listing open (unpaid) tickets, with a checkout drawer per order:
  itemised bill with VAT, tip presets or custom tip, card payment (simulated Stripe Terminal
  "present card" flow) and cash payment with automatic change calculation, and support for
  splitting a bill across multiple card/cash payments
- Manager-authorised refund and void flow — any staff member can start it, but it requires a
  manager PIN to confirm unless they're already signed in as a manager
- Every order now carries a payment status and payment history in the shared record

**Iteration 3 — offline resilience + till & end-of-day reconciliation**:
- A minimal service worker (`public/sw.js`) caches the app shell so `/`, `/order`, `/kds`,
  `/payments` and `/till` keep loading through a connectivity drop, plus a `manifest.json` so
  the app is installable on a restaurant tablet
- Real connectivity detection (`navigator.onLine` + `online`/`offline` events) drives an offline
  banner across every screen; a "(demo) toggle connectivity" control in the top bar simulates a
  drop without needing devtools network throttling
- Orders taken while offline are written locally immediately (so order-taking never blocks) and
  marked "queued"; once the connection returns they're automatically marked "synced" — each
  order keeps the id it was created with, which is the idempotency key a real backend would
  dedupe on to prevent duplicate orders
- `/till` (manager-only): open the till with a counted opening float, log cash in/out during the
  shift, see live sales broken down by payment method, best-selling items, and staff member,
  close the till against a counted amount with automatic discrepancy flagging, and export the
  day's transactions to CSV
- A "Print receipt" button on the payment-complete screen opens a formatted, itemised VAT
  receipt in a print-ready window (stands in for the thermal printer/WebUSB integration)

**Iteration 4 — discounts, staff discounts, and reporting & admin**:
- Order screen: "Add discount" applies a promo code (`WELCOME10`, `FAMILY15`, `REGULAR5` in
  `src/lib/mock-data.ts`) or a manager-authorised staff discount (10/20/50%/comp with a reason),
  gated behind the same manager-PIN flow as refunds unless the signed-in user already is one
- `/reports` (manager-only): daily/weekly/monthly/all-time view of net sales, order count,
  average order value, discounts given, best-selling items, and revenue by staff member
- A full **void, refund and staff-discount audit log** — every one of those actions is recorded
  with who performed it, who authorised it (for staff discounts), the amount, a reason, and a
  timestamp, filterable by the same date range as the rest of the report
- `restaurantId` scaffolding added to orders and till sessions (requirement 2.5's low-cost
  future-proofing for adding a second location later) — currently a single constant, but every
  record carries it so multi-site is a config change rather than a schema migration

**Iteration 5 — split-bill and merge-order**, the last gap in the Order Taking requirements:
- **Split bill** (`/payments` → "Split bill" on an unpaid ticket): assign items to 2–6 seats —
  "Split evenly" auto-distributes quantities, or adjust per-item per-seat counts manually — then
  take each seat's payment (card or cash, with its own tip) one at a time, with a per-seat
  itemised receipt available at each step. The order tracks a new `partial` payment status while
  a split is mid-way through, and the item total, VAT and discount are prorated per seat
- **Merge orders** (`/payments` → "Merge into another table" on any open ticket): combine two
  open tickets — e.g. two parties pushed together, or a duplicate ticket opened by mistake — into
  one, carrying items and any payments already taken across; logged to the audit trail
- `src/lib/billing.ts` centralises the subtotal/VAT/discount/amount-due math that was previously
  duplicated across the checkout drawer, payments list, till and reports, so partial payments are
  now handled consistently everywhere revenue is calculated
- Till and reports now count cash/card actually taken on partially-paid (split-in-progress)
  orders, not just fully-paid ones — the money is real the moment it's taken, even before every
  seat has settled

**Not yet built** (later iterations, per the requirements doc):
- Real AWS Cognito user pool, IP allowlisting at the network edge, session token handling
- Real Stripe Terminal hardware integration (this build simulates the "present card" step)
- Real thermal printer / cash drawer / barcode scanner hardware integration
- Xero/QuickBooks accounting export (CSV export exists; direct integration doesn't)
- Real Prisma/RDS-backed menu, orders, till and audit data (currently mocked in
  `src/lib/mock-data.ts` and `src/lib/store.tsx`, written to be easy to swap for real API calls)
- A real multi-device sync channel — this prototype runs in one browser's localStorage, so
  "offline queue → sync" is demonstrated on a single device rather than across POS + KDS + website
- Enforced HMRC 6-year record retention — this demo never deletes records locally, but has no
  real long-term store to enforce that against

**Known simplification:** split-bill only opens on a fully `unpaid` order, so the seat
assignment always matches the whole ticket. If a split is interrupted partway through, the
remaining balance can still be taken via the normal checkout drawer (it correctly shows what's
left owing), but the per-seat item breakdown isn't preserved for that final payment.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:3000. You'll be asked to sign in with a staff PIN — try:

| Name | Role | PIN |
| --- | --- | --- |
| Anita Nair | Manager | 1234 |
| Devan Kumar | Staff | 2345 |
| Priya Menon | Staff | 3456 |
| Raj Suresh | Staff | 4567 |

From there: **Order** takes orders (try a promo code or a staff discount), **Kitchen Display**
runs the kitchen queue, **Payments** lists open tickets to check out, **Till** (manager PIN)
opens/closes the till, and **Reports** (manager PIN) rolls everything up with the audit log. The
wifi icon in the top bar toggles a simulated offline state so you can see orders queue and sync.
Data persists in the browser's localStorage between refreshes (the staff session uses
sessionStorage, so it clears when the tab closes); there's no backend yet.

## Where to plug in the real backend later

- `src/lib/mock-data.ts` — replace with Prisma queries against the shared menu/staff/promo tables
- `src/lib/store.tsx` — replace the in-memory/localStorage state with API calls + a
  real-time channel (e.g. polling or websockets) so POS and KDS stay in sync across devices;
  the `syncStatus` field and reconnect effect are the seam for a real offline queue/outbox
- `src/lib/auth.tsx` — replace PIN lookup with real AWS Cognito auth (Amplify Auth or a
  custom Cognito hosted UI flow), keeping the same `useAuth()` shape so components don't change
- `src/lib/connectivity.tsx` — keep the same `useConnectivity()` shape; a production build would
  likely also confirm connectivity against the actual API rather than only `navigator.onLine`
- `public/sw.js` — a real deployment should generate this (e.g. via Workbox/next-pwa) with
  proper versioned asset caching rather than the hand-rolled shell cache here
- `src/lib/types.ts` — should map closely onto the eventual Prisma schema; `restaurantId` is
  already threaded through orders and till sessions for when a second location is added

