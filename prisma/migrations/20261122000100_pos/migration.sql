-- AlterEnum
ALTER TYPE "Category" ADD VALUE 'DRINK';
ALTER TYPE "Category" ADD VALUE 'DESSERT';

-- AlterEnum
ALTER TYPE "OrderType" ADD VALUE 'DINE_IN';

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "dietary" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "spiceLevelOptions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "modifierGroups" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "availableOnline" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "availablePos" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "calories" INTEGER,
ADD COLUMN "vatRateBasisPoints" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "orderNumber" SERIAL NOT NULL,
ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'online',
ADD COLUMN "kitchenStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
ADD COLUMN "tableNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "guestCount" INTEGER,
ADD COLUMN "customerNote" TEXT,
ADD COLUMN "staffName" TEXT,
ADD COLUMN "staffId" TEXT,
ADD COLUMN "tip" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "discountCode" TEXT,
ADD COLUMN "discount" JSONB,
ADD COLUMN "serviceChargePercent" DOUBLE PRECISION,
ADD COLUMN "sentToKitchen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "scheduledFor" TIMESTAMP(3),
ADD COLUMN "scheduleReleased" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "voidReason" TEXT,
ADD COLUMN "customerId" TEXT,
ADD COLUMN "deliveryDetails" JSONB,
ADD COLUMN "stripePaymentIntentId" TEXT,
ADD COLUMN "mergedIntoOrderId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "name" TEXT,
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "spiceLevel" TEXT,
ADD COLUMN "modifiers" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "notes" TEXT,
ADD COLUMN "allergens" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "flaggedDelayed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "flaggedUnavailable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "validFrom" TIMESTAMP(3),
ADD COLUMN "maxUses" INTEGER,
ADD COLUMN "useCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "channels" TEXT[] NOT NULL DEFAULT ARRAY['POS', 'online']::TEXT[];

-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL DEFAULT '',
    "tagline" TEXT NOT NULL DEFAULT '',
    "address_lines" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "vat_number" TEXT NOT NULL DEFAULT '',
    "company_number" TEXT NOT NULL DEFAULT '',
    "receipt_footer" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "vat_rate_bp" INTEGER NOT NULL DEFAULT 2000,
    "default_service_charge_percent" DOUBLE PRECISION NOT NULL DEFAULT 12.5,
    "service_charge_min_guests" INTEGER NOT NULL DEFAULT 6,
    "inactivity_logout_minutes" INTEGER NOT NULL DEFAULT 10,
    "auto_send_to_kitchen" BOOLEAN NOT NULL DEFAULT false,
    "kds_warn_minutes" INTEGER NOT NULL DEFAULT 15,
    "tip_presets" INTEGER[] NOT NULL DEFAULT ARRAY[10, 12, 15]::INTEGER[],
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "password_changed_at" TIMESTAMPTZ(3),
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_normalised" TEXT NOT NULL,
    "email" TEXT,
    "postcode" TEXT NOT NULL DEFAULT '',
    "address_line1" TEXT NOT NULL DEFAULT '',
    "street" TEXT NOT NULL DEFAULT '',
    "town" TEXT,
    "notes" TEXT,
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "last_order_at" TIMESTAMPTZ(3),
    "anonymised_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount_pence" INTEGER NOT NULL,
    "cash_tendered_pence" INTEGER,
    "change_given_pence" INTEGER,
    "stripe_payment_intent_id" TEXT,
    "taken_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taken_by_staff_id" TEXT NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "till_sessions" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "opening_float_pence" INTEGER NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL,
    "opened_by_staff_id" TEXT NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "counted_cash_pence" INTEGER,
    "expected_cash_pence" INTEGER,
    "closed_by_staff_id" TEXT,
    "notes" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "till_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "till_session_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount_pence" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "staff_id" TEXT NOT NULL,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order_id" TEXT,
    "order_number" INTEGER,
    "amount_pence" INTEGER,
    "reason" TEXT NOT NULL,
    "performed_by_staff_id" TEXT NOT NULL,
    "approved_by_staff_id" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_ops" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "staff_id" TEXT,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_ops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuItem_updatedAt_idx" ON "MenuItem"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripePaymentIntentId_key" ON "Order"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_updatedAt_idx" ON "Order"("updatedAt");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE INDEX "staff_restaurant_id_idx" ON "staff"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_restaurant_id_phone_normalised_key" ON "customers"("restaurant_id", "phone_normalised");

-- CreateIndex
CREATE INDEX "customers_updated_at_idx" ON "customers"("updated_at");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_taken_at_idx" ON "payments"("taken_at");

-- CreateIndex
CREATE INDEX "till_sessions_restaurant_id_opened_at_idx" ON "till_sessions"("restaurant_id", "opened_at");

-- CreateIndex
CREATE INDEX "audit_log_restaurant_id_at_idx" ON "audit_log"("restaurant_id", "at");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "till_sessions" ADD CONSTRAINT "till_sessions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_till_session_id_fkey" FOREIGN KEY ("till_session_id") REFERENCES "till_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Data: ticket numbers start at 101 (existing website orders keep the numbers they were just given)
SELECT setval(pg_get_serial_sequence('"Order"', 'orderNumber'), GREATEST((SELECT COALESCE(MAX("orderNumber"), 0) FROM "Order"), 100));

-- Data: backfill POS fields on orders the website created before this migration
UPDATE "Order" SET "paymentStatus" = 'paid', "sentToKitchen" = true
  WHERE "status" IN ('CONFIRMED', 'PREPARING', 'READY', 'DELIVERED');
UPDATE "Order" SET "paymentStatus" = 'void' WHERE "status" = 'CANCELLED';
UPDATE "Order" SET "kitchenStatus" = CASE "status"
    WHEN 'PREPARING' THEN 'preparing' WHEN 'READY' THEN 'ready' WHEN 'DELIVERED' THEN 'served' ELSE 'pending' END;
UPDATE "OrderItem" oi SET "name" = m."name", "allergens" = m."allergens"
  FROM "MenuItem" m WHERE m."id" = oi."menuItemId" AND oi."name" IS NULL;
