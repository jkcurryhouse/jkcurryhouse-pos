# JK Curryhouse POS

In-restaurant point of sale for JK Curryhouse, Chippenham (The Real Indian Kitchen). It covers
order taking, the kitchen display, card and cash payments, split bills, till reconciliation and
reporting, plus an **admin panel**. It shares **one PostgreSQL database on Amazon RDS** (stack
`jk-curryhouse-db`) with the public website (`jkcurryhouse-web`). Database access uses
**Prisma ORM 7**.

```
 Tills / tablets / KDS ─► POS (Next.js, Amplify) ─┐
   (IP allow-listed)                               ├─TLS─► RDS PostgreSQL (one database)
 Customers ─────────────► Website (Next.js) ──────┘        MenuItem · Order · OrderItem · Offer (shared)
                           Stripe webhook ─────────┘        + POS tables: staff, payments, till, audit…
```

### How the two apps share data

| Website table | What the POS does with it |
|---|---|
| `MenuItem` | Same menu on both. `isAvailable` is shared stock: the POS 86 button makes the website show "Sold out". POS columns are added: options, spice levels, dietary tags, POS/web availability, archived, sort order |
| `Order` / `OrderItem` | Till orders are written here too (`channel = 'POS'`, type `DINE_IN` added). Paid website orders appear on the kitchen display. Kitchen progress updates the website's `status` (Preparing, Ready, Delivered). `orderNumber` is a shared sequence |
| `Offer` | The promo codes for both. `isPercent` (% or £ off), plus `active`, `validFrom`, `maxUses`, `useCount`, `channels` |
| `Reservation`, `UserOffer` | Website only; the POS doesn't touch them |

POS-only tables: `restaurants` (settings), `staff`, `customers`, `payments`, `till_sessions`,
`cash_movements`, `audit_log`, `processed_ops`.

**This repo owns the schema and migrations** (`prisma/schema.prisma`, `prisma/migrations/`).
The website repo has an identical copy of the models and only runs `prisma generate`.
**Never run `prisma db push`** from either repo: each would try to drop the other app's tables.

## Backend

- **Prisma 7** with the `@prisma/adapter-pg` driver adapter, so there's no Rust query engine
  binary, which suits Amplify's Lambda runtime. The client is generated to `src/generated/prisma`
  at install and build time.
- **Migrations:**
  - `20261122000000_website_baseline` is exactly the tables the website created with `db push`.
  - `20261122000100_pos` only adds new enum values, columns and tables. It also backfills
    existing website orders and starts ticket numbers at 101.
- **Money:** GBP decimals on the shared tables (the website convention), integer pence on
  POS-only tables.
- **Server-authoritative:** line prices come from `MenuItem`. Offers are checked on the server.
  Payment status is derived from recorded payments.
- **Offline-first sync:** changes apply locally, then queue in an outbox, then go to
  `POST /api/ops`, which applies each one exactly once. Terminals poll `GET /api/sync?since=`
  every 3 seconds. Website checkouts that were never paid are hidden from the POS.
- **Network allow-list:** `POS_ALLOWED_IPS` is enforced in middleware. The client IP is taken
  from CloudFront's appended address.
- **Audit log** and **retention**: orders are never deleted (HMRC requires 6 years). GDPR
  erasure wipes personal data but keeps the financial rows.

## Authentication (email + password)

- Each person signs in with **their email address and their own password**.
  - Passwords are bcrypt-hashed (cost 12) and never stored, logged or shown.
  - The session is a signed, httpOnly, `SameSite=Strict` cookie lasting 14 hours.
  - Staff are signed out automatically after a configurable idle time.
- **Password rules:** at least 10 characters (phrases encouraged). Common passwords and passwords
  containing the person's name or email are rejected.
- **Lockout:** after 5 wrong passwords the account locks for 15 minutes. An admin can unlock it
  sooner. Error messages never reveal whether an email exists, and failed sign-ins take the same
  time either way.
- **New accounts and resets:**
  - An admin creates the account and gets a one-time temporary password, shown once, to hand over
    in person.
  - The person must choose their own password at first sign-in. Until they do, every API returns
    `password_change_required`.
- **Changing or resetting a password signs that account out on every other device.** The
  session token carries a password version. Deactivating an account also ends its sessions
  immediately.
- **Manager overrides** (refund, void, staff discount): a signed-in manager just confirms.
  Otherwise a manager picks their name and enters their password, which produces a signed
  approval valid for 15 minutes. The server checks it again when it applies the change.
- **Quick shift handover:** the sign-in screen remembers the people who recently used that device
  (name and email only, never passwords). Tapping a tile pre-fills the email.
- Everyone can change their own password from the key icon in the top bar.

Roles: **staff** take orders and payments. A **manager** can also authorise overrides and use
the till, reports and admin panel. An **admin** can also manage staff accounts and settings.

## Admin panel (`/admin`)

| Page | What it does |
|---|---|
| Dashboard | Today's net sales, average order, open tickets, card/cash takings, 14-day chart, best sellers, 86'd items, recent activity |
| Orders | Search and filter every POS and website order; full detail with payments and audit trail; CSV export |
| Sales reports | Any date range: net sales, VAT split, discounts, service charge, tips, refunds; sales by day, hour, channel, category, item and staff; takings by method; promo usage; CSV exports for Xero or QuickBooks |
| Menu | The shared menu: price, section, photo URL, all 14 UK allergens, dietary tags, spice levels, option groups with price add-ons, chef's pick, stock (POS and website), POS vs website availability, archive |
| Promotions | The website's Offers: % or £ off, title and description, start and end dates, minimum spend, usage limits, POS/website channels |
| Customers | Search, edit, marketing opt-in, order history and spend, GDPR erase, list exports |
| Till history | Float, cash and card taken, cash in/out, expected vs counted, over or short |
| Staff | (admin) Create accounts, change roles and emails, reset passwords (temporary password), unlock, deactivate. The last admin is protected |
| Audit log | Filter by category, staff and dates; CSV export |
| Settings | (admin) Name, address, **VAT number** and footer on receipts, VAT rate, service charge, tip presets, auto sign-out, KDS warning time, auto-send to kitchen, next order number, network allow-list status |

## Running locally

```bash
npm install                     # also runs `prisma generate`
cp .env.example .env            # DATABASE_URL (local Postgres), DATABASE_SSL=disable, SESSION_SECRET
npx prisma migrate deploy       # website tables + POS additions
npm run db:seed                 # settings row, the real menu (only if MenuItem is empty), offers, demo staff
npm run dev
```

The demo accounts all start with the password `ChangeMe-2026!` and must set their own at first
sign-in:

| Name | Email | Role |
| --- | --- | --- |
| Anita Nair | anita@jkcurryhouse.co.uk | Admin |
| Raj Suresh | raj@jkcurryhouse.co.uk | Manager |
| Devan Kumar | devan@jkcurryhouse.co.uk | Staff |
| Priya Menon | priya@jkcurryhouse.co.uk | Staff |

**Schema changes:**
1. Edit `prisma/schema.prisma` here.
2. Run `npm run db:migrate:dev -- --name <change>` and commit the migration.
3. Copy the models section into `jkcurryhouse-web/prisma/schema.prisma` and run
   `npx prisma generate` there.

> The two initial migrations were written to Prisma's conventions and tested on PostgreSQL 16,
> both on an empty database and on top of a website-only database. The first time you run
> `npx prisma migrate dev` locally, Prisma compares them with the schema. If it reports drift,
> review what it generates before committing.

## Deploying (first time, onto the website's existing database)

Do these in order. Step 1 only adds to the database, so the current live website keeps
working while you do the rest.

1. **Migrate the shared database (from your computer, in this repo).** Put the RDS connection
   string in `.env` as `DATABASE_URL=...?sslmode=require`. Then mark the website's existing
   tables as the baseline and apply the POS changes:
   ```bash
   npm install
   npx prisma migrate resolve --applied 20261122000000_website_baseline
   npx prisma migrate deploy
   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_NAME="Your Name" \
   SEED_ADMIN_PASSWORD='a long temporary phrase' npm run db:seed
   ```
   If `migrate deploy` fails because the existing tables differ from the baseline, the data is
   test-only, so you can start clean instead: `npx prisma migrate reset`. That drops everything,
   applies both migrations and runs the seed; set the `SEED_` variables first.
2. **Deploy the website update** (`jkcurryhouse-web`) as usual through its Amplify app. Its build
   only runs `prisma generate`.
3. **Deploy the POS** as a separate Amplify app from this repo. Set `DATABASE_URL`,
   `DATABASE_SSL=require`, `SESSION_SECRET`, `ENABLE_DEMO_TOOLS=false`, and leave
   `POS_ALLOWED_IPS` empty for now. `amplify.yml` runs `prisma migrate deploy`, which has nothing
   left to do after step 1, and builds.
4. **Set up:** sign in as your admin and set your own password. Under Settings, enter the
   address and VAT number. Add staff. Check the menu.
5. **Lock it down:** check the restaurant's IP under Admin → Settings → Network, set
   `POS_ALLOWED_IPS`, and redeploy.

Later schema changes: commit a migration here and every POS deploy applies it automatically.
Deploy the website after the POS if it relies on the new columns.

## API overview

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` · `logout` · `GET me` | Email + password sign-in (cookie session) |
| `POST /api/auth/change-password` | Change own password (also completes a temporary-password sign-in) |
| `POST /api/auth/manager-approval` | Manager id + password → 15-minute signed approval |
| `GET /api/sync[?since=ms]` | Bootstrap / delta of menu, orders, till, customers, settings, audit |
| `POST /api/ops` | Apply queued changes (order create/pay/refund/void/merge, KDS status, 86, till), idempotent |
| `GET /api/reports/data` | Orders + audit for the POS Reports screen |
| `/api/admin/*` | Dashboard, reports, CRUD for menu, categories, staff, promos, customers and settings; orders; till sessions; audit; CSV export |
| `GET /api/health` | Connectivity + DB probe |

**Website integration:** see "How the two apps share data" above. The website's order flow is:
1. `POST /api/orders` prices the basket on the server and creates a `PENDING` / unpaid order
   with the Stripe PaymentIntent id.
2. The Stripe webhook, or `/confirm` after verifying with Stripe, marks it paid with
   `sentToKitchen = true`.
3. It then appears on the kitchen display.

`/api/demo/online-order` writes the same shape of order for demos.

## Known limitations / next steps

- Stripe Terminal is still simulated in the checkout drawer. `payments.stripe_payment_intent_id`
  is ready for the real integration.
- Refunding a website order on the POS records the refund. The card refund itself still has to be
  issued in the Stripe dashboard.
- Menu sections are the shared `Category` enum. Adding a section needs a migration.
- Thermal printer, cash drawer and scanner hardware aren't integrated; receipts print through the browser.
- Signing in, changing a password and manager approval need a connection. Order-taking,
  payments, KDS updates and 86'ing keep working offline and sync later.
- There's no self-service "forgot password" email. An admin resets it, which avoids a public reset
  endpoint on a network-restricted POS.
