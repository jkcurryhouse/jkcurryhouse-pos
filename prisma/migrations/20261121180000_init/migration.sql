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
    "next_order_number" INTEGER NOT NULL DEFAULT 101,
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
CREATE TABLE "menu_categories" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price_pence" INTEGER NOT NULL,
    "allergens" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "dietary" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "spice_level_options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "modifier_groups" JSONB NOT NULL DEFAULT '[]',
    "is_todays_special" BOOLEAN NOT NULL DEFAULT false,
    "is_out_of_stock" BOOLEAN NOT NULL DEFAULT false,
    "available_pos" BOOLEAN NOT NULL DEFAULT true,
    "available_online" BOOLEAN NOT NULL DEFAULT true,
    "vat_rate_bp" INTEGER,
    "calories" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "percent_off" DOUBLE PRECISION NOT NULL,
    "min_spend_pence" INTEGER NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMPTZ(3),
    "valid_to" TIMESTAMPTZ(3),
    "max_uses" INTEGER,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "channels" TEXT[] NOT NULL DEFAULT ARRAY['POS', 'online']::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "order_number" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "order_type" TEXT NOT NULL,
    "table_numbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "guest_count" INTEGER,
    "customer_note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payment_status" TEXT NOT NULL DEFAULT 'unpaid',
    "staff_name" TEXT NOT NULL,
    "staff_id" TEXT,
    "tip_pence" INTEGER NOT NULL DEFAULT 0,
    "void_reason" TEXT,
    "discount" JSONB,
    "discount_pence" INTEGER NOT NULL DEFAULT 0,
    "sent_to_kitchen" BOOLEAN NOT NULL DEFAULT false,
    "service_charge_percent" DOUBLE PRECISION,
    "scheduled_for" TIMESTAMPTZ(3),
    "schedule_released" BOOLEAN NOT NULL DEFAULT false,
    "customer_id" TEXT,
    "delivery_details" JSONB,
    "merged_into_order_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "order_id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "menu_item_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit_price_pence" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "spice_level" TEXT,
    "modifiers" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "allergens" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "flagged_delayed" BOOLEAN NOT NULL DEFAULT false,
    "flagged_unavailable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("order_id","line_id")
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
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE INDEX "staff_restaurant_id_idx" ON "staff"("restaurant_id");

-- CreateIndex
CREATE INDEX "menu_items_category_id_idx" ON "menu_items"("category_id");

-- CreateIndex
CREATE INDEX "menu_items_updated_at_idx" ON "menu_items"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_restaurant_id_code_key" ON "promo_codes"("restaurant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_restaurant_id_phone_normalised_key" ON "customers"("restaurant_id", "phone_normalised");

-- CreateIndex
CREATE INDEX "customers_updated_at_idx" ON "customers"("updated_at");

-- CreateIndex
CREATE INDEX "orders_restaurant_id_created_at_idx" ON "orders"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_updated_at_idx" ON "orders"("updated_at");

-- CreateIndex
CREATE INDEX "orders_payment_status_idx" ON "orders"("payment_status");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_taken_at_idx" ON "payments"("taken_at");

-- CreateIndex
CREATE INDEX "till_sessions_restaurant_id_opened_at_idx" ON "till_sessions"("restaurant_id", "opened_at");

-- CreateIndex
CREATE INDEX "audit_log_restaurant_id_at_idx" ON "audit_log"("restaurant_id", "at");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "till_sessions" ADD CONSTRAINT "till_sessions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_till_session_id_fkey" FOREIGN KEY ("till_session_id") REFERENCES "till_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

