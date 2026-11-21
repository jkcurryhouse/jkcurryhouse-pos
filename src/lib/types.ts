export type Allergen =
  | "gluten"
  | "dairy"
  | "nuts"
  | "peanuts"
  | "shellfish"
  | "fish"
  | "egg"
  | "soya"
  | "mustard"
  | "sesame"
  | "sulphites";

export type SpiceLevel = "mild" | "medium" | "hot" | "extra-hot";

export interface ModifierOption {
  id: string;
  label: string;
  priceDelta: number; // in GBP, 0 for free options
}

export interface ModifierGroup {
  id: string;
  label: string;
  required: boolean;
  multiSelect: boolean;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number; // GBP
  categoryId: string;
  allergens: Allergen[];
  isTodaysSpecial?: boolean;
  isOutOfStock?: boolean;
  modifierGroups?: ModifierGroup[];
  spiceLevelOptions?: SpiceLevel[];
}

export interface MenuCategory {
  id: string;
  name: string;
}

export type OrderType = "dine-in" | "takeaway" | "delivery";

export type OrderStatus = "pending" | "preparing" | "ready" | "served";

export interface SelectedModifier {
  groupId: string;
  groupLabel: string;
  optionId: string;
  optionLabel: string;
  priceDelta: number;
}

export interface OrderLineItem {
  lineId: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  spiceLevel?: SpiceLevel;
  modifiers: SelectedModifier[];
  notes?: string;
  allergens: Allergen[];
  status: OrderStatus;
  flaggedDelayed?: boolean;
  flaggedUnavailable?: boolean;
}

export interface Order {
  id: string;
  restaurantId: string;
  orderNumber: number;
  channel: "POS" | "online";
  orderType: OrderType;
  // Multiple tables can be combined onto a single bill for one large party
  // (e.g. tables 4 and 5 pushed together) — still always one order, one
  // total. Most dine-in orders will just have a single entry here.
  tableNumbers?: string[];
  customerNote?: string;
  items: OrderLineItem[];
  status: OrderStatus;
  createdAt: number;
  staffName: string;
  staffId?: string;
  paymentStatus: PaymentStatus;
  payments: Payment[];
  tip: number;
  voidReason?: string;
  syncStatus: SyncStatus;
  discount?: OrderDiscount;
  // Whether this order has been pushed onto the Kitchen Display queue.
  // Temporarily defaults to false for all new orders (see
  // AUTO_SEND_TO_KITCHEN_DISPLAY in store.tsx) — flip that flag, or use the
  // manual "Send to kitchen" action, to route orders there again.
  sentToKitchen?: boolean;
  // Discretionary service charge, stored as a whole-number percentage (e.g.
  // 12.5 for 12.5%) applied to the net item subtotal at checkout — common
  // UK practice for larger dine-in parties. Optional and separate from tip.
  serviceChargePercent?: number;
  // Epoch ms for when this order should be ready — e.g. "customer collecting
  // at 7:30pm" or "deliver for 8pm". Orders with a future scheduledFor sit
  // in a separate "Waiting" queue on the KDS instead of the kitchen's active
  // Pending column, so the kitchen isn't asked to start it too early.
  scheduledFor?: number;
  // Set once staff pull a waiting order into the kitchen queue early (before
  // its scheduledFor time). Kept separate from scheduledFor so the
  // customer's original requested time still prints correctly on the
  // ticket/receipt even after the order has started.
  scheduleReleased?: boolean;
  // Number of diners at the table (dine-in). Informational — printed on the
  // kitchen ticket and receipt — the order is always billed as one single
  // bill for the table unless staff explicitly use Split Bill.
  guestCount?: number;
  // Links back to the Customer record (for order-history / offer eligibility lookups).
  customerId?: string;
  // Snapshot of name/phone/address at the time of the order, so receipts,
  // the KDS ticket and delivery drivers always show what was true then —
  // even if the customer's saved record is edited or deleted later.
  deliveryDetails?: CustomerContactSnapshot;
}

export interface CustomerContactSnapshot {
  name: string;
  phone: string;
  postcode: string;
  addressLine1: string; // house number/name
  street: string;
  town?: string;
}

// A saved customer record, shared with the website's customer table.
// Captured via POS for takeaway/delivery orders so repeat customers can be
// recognised for loyalty/regular-customer offers, and so delivery orders
// carry a verified UK address.
export interface Customer extends CustomerContactSnapshot {
  id: string;
  notes?: string;
  // GDPR: explicit opt-in required before phone/details are used for
  // marketing offers rather than just this order's delivery.
  marketingOptIn: boolean;
  createdAt: number;
  updatedAt: number;
  orderCount: number;
  lastOrderAt?: number;
}

export interface OrderDiscount {
  id: string;
  kind: "promo" | "staff";
  code?: string;
  label: string;
  amount: number; // flat GBP amount taken off the subtotal
  appliedByStaffId: string;
  approvedByStaffId?: string; // manager who authorised a staff discount
  appliedAt: number;
}

export interface PromoCode {
  code: string;
  label: string;
  percentOff: number;
}

export type SyncStatus = "synced" | "queued";

export type StaffRole = "staff" | "manager";

export interface StaffAccount {
  id: string;
  name: string;
  role: StaffRole;
  pin: string;
  initials: string;
}

export type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded" | "void";

export type PaymentMethod = "card" | "cash";

export interface Payment {
  id: string;
  method: PaymentMethod;
  amount: number;
  cashTendered?: number;
  changeGiven?: number;
  takenAt: number;
  takenByStaffId: string;
}

export interface CashMovement {
  id: string;
  type: "in" | "out";
  amount: number;
  reason: string;
  at: number;
  staffId: string;
}

export interface TillSession {
  id: string;
  restaurantId: string;
  openingFloat: number;
  openedAt: number;
  openedByStaffId: string;
  closedAt?: number;
  countedCash?: number;
  closedByStaffId?: string;
  cashMovements: CashMovement[];
}

export type AuditActionType = "refund" | "void" | "staff-discount" | "manager-override";

export interface AuditLogEntry {
  id: string;
  type: AuditActionType;
  orderId?: string;
  orderNumber?: number;
  amount?: number;
  reason: string;
  performedByStaffId: string;
  approvedByStaffId?: string;
  at: number;
}


