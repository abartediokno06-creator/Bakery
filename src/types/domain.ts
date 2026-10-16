import type { Enums, Tables, Views } from "./database.types";

export type Branch = Tables<"branches">;
export type Profile = Tables<"profiles">;
export type Product = Tables<"products">;
export type BranchInventoryRow = Tables<"branch_inventory">;
export type Transaction = Tables<"transactions">;
export type StockTransfer = Tables<"stock_transfers">;
export type CashShift = Tables<"cash_shifts">;
export type SpecialOrder = Views<"v_special_orders">;
export type OpenDrawer = Views<"v_open_drawers">;

export type AppRole = Enums<"app_role">;
export type PaymentMethod = Enums<"payment_method">;
export type TransferStatus = Enums<"transfer_status">;
export type OrderStatus = Enums<"order_status">;

/** Senior citizen / PWD discount details the BIR log needs. */
export type DiscountLogInput = {
  type: "senior" | "pwd";
  customer_name: string;
  id_number: string;
};

/** Inventory row joined with its product, as used by POS and stock screens. */
export type InventoryItem = BranchInventoryRow & {
  product: Pick<Product, "id" | "sku" | "barcode" | "name" | "category" | "kind" | "unit" | "price" | "is_sellable" | "is_active" | "image_url">;
};

export type BranchAccess = {
  branch: Branch;
  role: AppRole | "super_admin";
};

export type CartLine = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineDiscount: number;
};

/** Payload sent to the process_sale RPC. Mirrors the SQL doc comment. */
export type SalePayload = {
  client_id: string;
  branch_id: string;
  shift_id: string | null;
  payment_method: PaymentMethod;
  amount_tendered: number;
  payment_ref: string | null;
  discount_total: number;
  sold_at: string;
  was_offline: boolean;
  /** Required with a Senior/PWD discount; saved to discount_logs. */
  discount_log?: DiscountLogInput | null;
  items: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    line_discount: number;
  }>;
};

export type ShiftReport = {
  shift_id: string;
  branch_id: string;
  cashier_id: string;
  opened_at: string;
  generated_at: string;
  opening_float: number;
  gross_sales: number;
  discounts: number;
  net_sales: number;
  txn_count: number;
  void_count: number;
  void_amount: number;
  by_method: Array<{ payment_method: PaymentMethod; txn_count: number; amount: number }>;
  pay_in: number;
  pay_out: number;
  cash_drop: number;
  expected_cash: number;
  closing_count?: number;
  variance?: number;
};
