/**
 * Seeds a fresh database: restaurant settings row, the starter menu, promo codes and the
 * staff accounts. Safe to re-run — existing rows are left untouched.
 *
 *   npx prisma db seed        (or: npm run db:seed)
 *
 * Staff passwords: set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD to create your own first
 * admin. Otherwise demo accounts are created with the password "ChangeMe-2026!" and are
 * forced to choose a new password at first sign-in.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { promoCodes, RESTAURANT_ID } from "../src/lib/mock-data";
import { websiteMenu } from "./seed-menu";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sslMode = (process.env.DATABASE_SSL ?? "require").toLowerCase();
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, ""),
    ssl: sslMode === "disable" ? false : { rejectUnauthorized: sslMode === "verify" },
    max: 2,
  }),
});

const DEMO_PASSWORD = "ChangeMe-2026!";
const STAFF = process.env.SEED_ADMIN_EMAIL
  ? [{ id: "staff-admin", name: process.env.SEED_ADMIN_NAME ?? "Owner", role: "admin", email: process.env.SEED_ADMIN_EMAIL, initials: "OW" }]
  : [
      { id: "staff-anita", name: "Anita Nair", role: "admin", email: "anita@jkcurryhouse.co.uk", initials: "AN" },
      { id: "staff-raj", name: "Raj Suresh", role: "manager", email: "raj@jkcurryhouse.co.uk", initials: "RS" },
      { id: "staff-devan", name: "Devan Kumar", role: "staff", email: "devan@jkcurryhouse.co.uk", initials: "DK" },
      { id: "staff-priya", name: "Priya Menon", role: "staff", email: "priya@jkcurryhouse.co.uk", initials: "PM" },
    ];

async function main() {
  await prisma.restaurant.upsert({
    where: { id: RESTAURANT_ID },
    update: {},
    create: {
      id: RESTAURANT_ID,
      name: "JK Curryhouse",
      legalName: "JK Curryhouse",
      tagline: "The Real Indian Kitchen",
      receiptFooter: "Thank you for dining with us!",
    },
  });

  const password = process.env.SEED_ADMIN_PASSWORD ?? DEMO_PASSWORD;
  const hash = await bcrypt.hash(password, 12);
  for (const s of STAFF) {
    await prisma.staff.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        restaurantId: RESTAURANT_ID,
        name: s.name,
        initials: s.initials,
        email: s.email.trim().toLowerCase(),
        role: s.role,
        passwordHash: hash,
        mustChangePassword: true,
      },
    });
  }

  // Menu: only when the shared menu is empty — never overwrite what the website already has.
  if ((await prisma.menuItem.count()) === 0) {
    for (const [i, m] of websiteMenu.entries()) {
      await prisma.menuItem.create({
        data: {
          id: m.id,
          name: m.name,
          description: m.description,
          price: m.price,
          category: m.category.toUpperCase() as "STARTER",
          allergens: m.allergens,
          isSpecial: !!m.chefPick,
          dietary: [m.isVegan && "vegan", (m.isVegan || m.isVegetarian) && "vegetarian", m.isSpicy && "spicy"].filter(Boolean) as string[],
          sortOrder: i * 10,
        },
      });
    }
    console.log(`  menu: ${websiteMenu.length} dishes added`);
  } else {
    console.log("  menu: already has items — left unchanged");
  }

  for (const p of promoCodes) {
    await prisma.offer.upsert({
      where: { code: p.code },
      update: {},
      create: {
        code: p.code,
        title: p.label,
        description: p.label,
        discount: p.percentOff,
        isPercent: true,
        isGeneral: true,
        expiresAt: new Date("2099-12-31T23:59:59Z"),
      },
    });
  }

  console.log("✓ seed complete");
  console.log(
    process.env.SEED_ADMIN_EMAIL
      ? `  Admin: ${process.env.SEED_ADMIN_EMAIL} (must change password at first sign-in)`
      : `  Demo accounts use the password "${DEMO_PASSWORD}" and must change it at first sign-in.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
