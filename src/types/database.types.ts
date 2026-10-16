// AUTO-GENERATED SHAPE. Regenerate after every migration with:
//   npm run db:types          (local)
//   npm run db:types:remote   (hosted project)
// This hand-written copy mirrors supabase/migrations/20260926000001_init.sql
// and 20260927000001_pos_features.sql so the project type-checks before you
// have a database running.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      branches: {
        Row: {
          id: string;
          code: string;
          brand: string;
          name: string;
          city: string;
          address: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          brand: string;
          name: string;
          city: string;
          address?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["branches"]["Insert"]>;
        Relationships: [];
      };
      branch_counters: {
        Row: { branch_id: string; receipt_seq: number; transfer_seq: number; order_seq: number };
        Insert: { branch_id: string; receipt_seq?: number; transfer_seq?: number; order_seq?: number };
        Update: { branch_id?: string; receipt_seq?: number; transfer_seq?: number; order_seq?: number };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          is_super_admin: boolean;
          default_branch_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          is_super_admin?: boolean;
          default_branch_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "profiles_default_branch_id_fkey";
            columns: ["default_branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      user_branch_roles: {
        Row: {
          user_id: string;
          branch_id: string;
          role: Database["public"]["Enums"]["app_role"];
          created_at: string;
        };
        Insert: {
          user_id: string;
          branch_id: string;
          role: Database["public"]["Enums"]["app_role"];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_branch_roles"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "user_branch_roles_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          sku: string;
          barcode: string | null;
          name: string;
          category: string;
          kind: Database["public"]["Enums"]["item_kind"];
          unit: string;
          price: number;
          cost: number;
          is_sellable: boolean;
          is_active: boolean;
          image_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sku: string;
          barcode?: string | null;
          name: string;
          category?: string;
          kind?: Database["public"]["Enums"]["item_kind"];
          unit?: string;
          price?: number;
          cost?: number;
          is_sellable?: boolean;
          is_active?: boolean;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      branch_inventory: {
        Row: {
          id: string;
          branch_id: string;
          product_id: string;
          quantity: number;
          reorder_level: number;
          price_override: number | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          product_id: string;
          quantity?: number;
          reorder_level?: number;
          price_override?: number | null;
          updated_at?: string;
        };
        Update: { reorder_level?: number; price_override?: number | null };
        Relationships: [
          {
            foreignKeyName: "branch_inventory_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_inventory_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_movements: {
        Row: {
          id: number;
          branch_id: string;
          product_id: string;
          qty_change: number;
          qty_after: number;
          reason: Database["public"]["Enums"]["movement_reason"];
          ref_table: string | null;
          ref_id: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Record<string, never>; // write via RPC only
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recipes: {
        Row: {
          id: string;
          output_product_id: string;
          name: string;
          yield_qty: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          output_product_id: string;
          name: string;
          yield_qty: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recipes"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "recipes_output_product_id_fkey";
            columns: ["output_product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_items: {
        Row: { recipe_id: string; ingredient_id: string; quantity: number };
        Insert: { recipe_id: string; ingredient_id: string; quantity: number };
        Update: { recipe_id?: string; ingredient_id?: string; quantity?: number };
        Relationships: [];
      };
      production_batches: {
        Row: {
          id: string;
          branch_id: string;
          recipe_id: string;
          batches: number;
          output_qty: number;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Record<string, never>; // write via RPC only
        Update: Record<string, never>;
        Relationships: [];
      };
      cash_shifts: {
        Row: {
          id: string;
          branch_id: string;
          cashier_id: string;
          status: Database["public"]["Enums"]["shift_status"];
          opening_float: number;
          closing_count: number | null;
          expected_cash: number | null;
          variance: number | null;
          z_report: Json | null;
          opened_at: string;
          closed_at: string | null;
        };
        Insert: Record<string, never>; // write via RPC only
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "cash_shifts_cashier_id_fkey";
            columns: ["cashier_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cash_drawer_events: {
        Row: {
          id: number;
          shift_id: string;
          kind: "pay_in" | "pay_out" | "cash_drop";
          amount: number;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          shift_id: string;
          kind: "pay_in" | "pay_out" | "cash_drop";
          amount: number;
          note?: string | null;
          created_by?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          client_id: string;
          branch_id: string;
          shift_id: string | null;
          cashier_id: string;
          receipt_no: string;
          subtotal: number;
          discount_total: number;
          total: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
          amount_tendered: number;
          change_due: number;
          payment_ref: string | null;
          status: Database["public"]["Enums"]["txn_status"];
          void_reason: string | null;
          voided_by: string | null;
          was_offline: boolean;
          sold_at: string;
          created_at: string;
        };
        Insert: Record<string, never>; // write via RPC only
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "transactions_cashier_id_fkey";
            columns: ["cashier_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_voided_by_fkey";
            columns: ["voided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      transaction_items: {
        Row: {
          id: number;
          transaction_id: string;
          product_id: string;
          product_name: string;
          quantity: number;
          unit_price: number;
          line_discount: number;
          line_total: number;
        };
        Insert: Record<string, never>; // write via RPC only
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "transaction_items_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_transfers: {
        Row: {
          id: string;
          transfer_no: string;
          from_branch_id: string;
          to_branch_id: string;
          status: Database["public"]["Enums"]["transfer_status"];
          notes: string | null;
          requested_by: string | null;
          dispatched_by: string | null;
          received_by: string | null;
          requested_at: string;
          dispatched_at: string | null;
          received_at: string | null;
          updated_at: string;
        };
        Insert: Record<string, never>; // write via RPC only
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_branch_id_fkey";
            columns: ["from_branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_transfers_to_branch_id_fkey";
            columns: ["to_branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_transfer_items: {
        Row: {
          id: number;
          transfer_id: string;
          product_id: string;
          qty_requested: number;
          qty_dispatched: number | null;
          qty_received: number | null;
        };
        Insert: Record<string, never>; // write via RPC only
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey";
            columns: ["transfer_id"];
            isOneToOne: false;
            referencedRelation: "stock_transfers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      discount_logs: {
        Row: {
          id: number;
          transaction_id: string;
          branch_id: string;
          discount_type: "senior" | "pwd";
          customer_name: string;
          id_number: string;
          discount_amount: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: Record<string, never>; // written by process_sale only
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "discount_logs_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discount_logs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      special_orders: {
        Row: {
          id: string;
          order_no: string;
          branch_id: string;
          customer_name: string;
          customer_phone: string | null;
          items: string;
          total: number;
          pickup_at: string;
          status: Database["public"]["Enums"]["order_status"];
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, never>; // write via RPC only
        Update: Record<string, never>;
        Relationships: [];
      };
      special_order_payments: {
        Row: {
          id: number;
          order_id: string;
          amount: number;
          method: Database["public"]["Enums"]["payment_method"];
          payment_ref: string | null;
          drawer_event_id: number | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Record<string, never>; // write via RPC only
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "special_order_payments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "special_orders";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      v_branch_daily_sales: {
        Row: {
          branch_id: string;
          sale_date: string;
          txn_count: number;
          net_sales: number;
          cash_sales: number;
          ewallet_sales: number;
        };
        Relationships: [];
      };
      v_low_stock: {
        Row: {
          branch_id: string;
          product_id: string;
          product_name: string;
          unit: string;
          kind: Database["public"]["Enums"]["item_kind"];
          quantity: number;
          reorder_level: number;
        };
        Relationships: [];
      };
      v_open_drawers: {
        Row: {
          shift_id: string;
          branch_id: string;
          cashier_id: string;
          cashier_name: string | null;
          opened_at: string;
          opening_float: number;
          txn_count: number;
          cash_sales: number;
          expected_cash: number;
        };
        Relationships: [];
      };
      v_special_orders: {
        Row: Database["public"]["Tables"]["special_orders"]["Row"] & { paid: number; balance: number };
        Relationships: [];
      };
    };
    Functions: {
      is_super_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      has_branch_access: { Args: { p_branch_id: string }; Returns: boolean };
      my_branch_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      process_sale: {
        Args: { p_payload: Json };
        Returns: Database["public"]["Tables"]["transactions"]["Row"];
      };
      void_sale: {
        Args: { p_transaction_id: string; p_reason: string };
        Returns: Database["public"]["Tables"]["transactions"]["Row"];
      };
      adjust_stock: {
        Args: {
          p_branch_id: string;
          p_product_id: string;
          p_delta: number;
          p_reason: Database["public"]["Enums"]["movement_reason"];
          p_note?: string | null;
        };
        Returns: number;
      };
      record_production: {
        Args: { p_branch_id: string; p_recipe_id: string; p_batches: number; p_note?: string | null };
        Returns: Database["public"]["Tables"]["production_batches"]["Row"];
      };
      request_transfer: {
        Args: { p_from_branch: string; p_to_branch: string; p_items: Json; p_notes?: string | null };
        Returns: Database["public"]["Tables"]["stock_transfers"]["Row"];
      };
      dispatch_transfer: {
        Args: { p_transfer_id: string; p_items?: Json | null };
        Returns: Database["public"]["Tables"]["stock_transfers"]["Row"];
      };
      receive_transfer: {
        Args: { p_transfer_id: string; p_items?: Json | null };
        Returns: Database["public"]["Tables"]["stock_transfers"]["Row"];
      };
      cancel_transfer: {
        Args: { p_transfer_id: string };
        Returns: Database["public"]["Tables"]["stock_transfers"]["Row"];
      };
      open_shift: {
        Args: { p_branch_id: string; p_opening_float: number };
        Returns: Database["public"]["Tables"]["cash_shifts"]["Row"];
      };
      shift_report: { Args: { p_shift_id: string }; Returns: Json };
      close_shift: {
        Args: { p_shift_id: string; p_closing_count: number };
        Returns: Database["public"]["Tables"]["cash_shifts"]["Row"];
      };
      admin_list_staff: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          id: string;
          email: string;
          full_name: string;
          is_active: boolean;
          is_super_admin: boolean;
          default_branch_id: string | null;
          last_sign_in_at: string | null;
          created_at: string;
          roles: Json;
        }>;
      };
      admin_create_staff: {
        Args: { p_email: string; p_password: string; p_full_name: string; p_roles: Json };
        Returns: string;
      };
      admin_update_staff: {
        Args: { p_user_id: string; p_full_name: string; p_roles: Json };
        Returns: undefined;
      };
      admin_set_password: { Args: { p_user_id: string; p_password: string }; Returns: undefined };
      admin_set_staff_active: { Args: { p_user_id: string; p_active: boolean }; Returns: undefined };
      record_leftovers: {
        Args: { p_branch_id: string; p_items: Json; p_note?: string | null };
        Returns: number;
      };
      report_best_sellers: {
        Args: { p_branch_ids: string[] | null; p_from: string; p_to: string };
        Returns: Array<{ product_id: string; product_name: string; qty: number; revenue: number }>;
      };
      report_sales_by_hour: {
        Args: { p_branch_ids: string[] | null; p_from: string; p_to: string };
        Returns: Array<{ hour: number; txn_count: number; net_sales: number }>;
      };
      report_waste: {
        Args: { p_branch_ids: string[] | null; p_from: string; p_to: string };
        Returns: Array<{ product_id: string; product_name: string; unit: string; sold_qty: number; wasted_qty: number }>;
      };
      create_special_order: {
        Args: {
          p_branch_id: string;
          p_customer_name: string;
          p_customer_phone: string | null;
          p_items: string;
          p_total: number;
          p_pickup_at: string;
          p_notes?: string | null;
          p_deposit?: number;
          p_deposit_method?: Database["public"]["Enums"]["payment_method"];
          p_deposit_ref?: string | null;
        };
        Returns: Database["public"]["Tables"]["special_orders"]["Row"];
      };
      pay_special_order: {
        Args: {
          p_order_id: string;
          p_amount: number;
          p_method: Database["public"]["Enums"]["payment_method"];
          p_ref?: string | null;
        };
        Returns: Database["public"]["Tables"]["special_order_payments"]["Row"];
      };
      set_special_order_status: {
        Args: { p_order_id: string; p_status: Database["public"]["Enums"]["order_status"] };
        Returns: Database["public"]["Tables"]["special_orders"]["Row"];
      };
    };
    Enums: {
      app_role: "branch_manager" | "cashier" | "baker";
      item_kind: "ingredient" | "finished_good" | "packaging";
      payment_method: "cash" | "gcash" | "qrph" | "card";
      txn_status: "completed" | "voided";
      transfer_status: "requested" | "dispatched" | "received" | "cancelled";
      shift_status: "open" | "closed";
      order_status: "pending" | "ready" | "picked_up" | "cancelled";
      movement_reason:
        | "sale"
        | "sale_void"
        | "transfer_out"
        | "transfer_in"
        | "production_consume"
        | "production_output"
        | "adjustment"
        | "spoilage"
        | "initial";
    };
    CompositeTypes: Record<string, never>;
  };
};

// ---- Helper aliases (same helpers the Supabase CLI emits) -------------
type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
export type RpcArgs<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T]["Args"];
export type RpcReturns<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T]["Returns"];
