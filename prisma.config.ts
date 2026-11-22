import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 reads the connection string here (not from schema.prisma).
// RDS forces TLS: keep `?sslmode=require` (or verify-full with the RDS CA) on DATABASE_URL
// when running `prisma migrate deploy` against AWS.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
