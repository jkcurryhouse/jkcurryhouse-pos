import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import {
  UtensilsCrossed,
  MonitorPlay,
  ShieldCheck,
  CreditCard,
  Landmark,
  BarChart3,
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 h-14 flex items-center border-b border-gold/25 bg-onyx">
        <BrandMark tone="dark" />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-cardamom/40 mb-3">
          Staff terminal · Iteration 5
        </span>
        <h1 className="font-display text-4xl sm:text-5xl leading-tight max-w-xl">
          Split it six ways, or push two tables together.
        </h1>
        <p className="text-cardamom/60 mt-4 max-w-md">
          Sign in, take orders, cook, get paid — including splitting a bill by item across
          several guests or merging two open tickets into one — close the till, and see it all
          rolled up in reporting with a full audit trail.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-10 w-full max-w-4xl">
          <Link
            href="/order"
            className="group rounded-2xl border border-cardamom/10 bg-white p-6 text-left hover:border-gold/50 hover:shadow-ticket transition-all"
          >
            <UtensilsCrossed className="text-gold-dark" size={26} />
            <h2 className="font-display text-xl mt-4">Take an order</h2>
            <p className="text-sm text-cardamom/55 mt-1">
              Now with promo codes and staff discounts.
            </p>
          </Link>
          <Link
            href="/kds"
            className="group rounded-2xl border border-cardamom/10 bg-charcoal p-6 text-left hover:border-gold/50 transition-all"
          >
            <MonitorPlay className="text-gold-light" size={26} />
            <h2 className="font-display text-xl mt-4 text-ivory">Kitchen display</h2>
            <p className="text-sm text-white/50 mt-1">
              Live queue combining POS and online orders.
            </p>
          </Link>
          <Link
            href="/payments"
            className="group rounded-2xl border border-cardamom/10 bg-white p-6 text-left hover:border-gold/50 hover:shadow-ticket transition-all"
          >
            <CreditCard className="text-chili" size={26} />
            <h2 className="font-display text-xl mt-4">Take payment</h2>
            <p className="text-sm text-cardamom/55 mt-1">
              Card, cash, split bills, tips, refunds/voids.
            </p>
          </Link>
          <Link
            href="/till"
            className="group rounded-2xl border border-cardamom/10 bg-white p-6 text-left hover:border-gold/50 hover:shadow-ticket transition-all"
          >
            <Landmark className="text-gold-dark" size={26} />
            <h2 className="font-display text-xl mt-4">Till &amp; end of day</h2>
            <p className="text-sm text-cardamom/55 mt-1">
              Float, cash in/out, discrepancy check, CSV export.
            </p>
          </Link>
          <Link
            href="/reports"
            className="group rounded-2xl border border-cardamom/10 bg-white p-6 text-left hover:border-gold/50 hover:shadow-ticket transition-all"
          >
            <BarChart3 className="text-gold-dark" size={26} />
            <h2 className="font-display text-xl mt-4">Reports &amp; admin</h2>
            <p className="text-sm text-cardamom/55 mt-1">
              Sales, best sellers, staff performance, audit log.
            </p>
          </Link>
        </div>

        <div className="flex items-center gap-2 text-xs text-cardamom/40 mt-10">
          <ShieldCheck size={14} />
          Real AWS/Cognito/Stripe/RDS wiring, split-bill/merge-order, and hardware integration
          land when this moves off the prototype.
        </div>
      </main>
    </div>
  );
}
