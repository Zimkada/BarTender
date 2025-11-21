export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accounting_transactions: {
        Row: {
          amount: number
          bar_id: string
          created_at: string
          created_by: string
          date: string
          description: string
          id: string
          reference_id: string | null
          type: string
        }
        Insert: {
          amount: number
          bar_id: string
          created_at?: string
          created_by: string
          date?: string
          description: string
          id?: string
          reference_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          bar_id?: string
          created_at?: string
          created_by?: string
          date?: string
          description?: string
          id?: string
          reference_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_transactions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          actions: Json | null
          bar_id: string | null
          bar_name: string | null
          id: string
          is_read: boolean
          is_resolved: boolean
          message: string
          metadata: Json | null
          priority: string
          timestamp: string
          title: string
          type: string
        }
        Insert: {
          actions?: Json | null
          bar_id?: string | null
          bar_name?: string | null
          id?: string
          is_read?: boolean
          is_resolved?: boolean
          message: string
          metadata?: Json | null
          priority: string
          timestamp?: string
          title: string
          type: string
        }
        Update: {
          actions?: Json | null
          bar_id?: string | null
          bar_name?: string | null
          id?: string
          is_read?: boolean
          is_resolved?: boolean
          message?: string
          metadata?: Json | null
          priority?: string
          timestamp?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          bar_id: string | null
          context_data: Json | null
          context_type: string | null
          created_at: string | null
          feedback: number | null
          id: string
          messages: Json
          tokens_used: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          bar_id?: string | null
          context_data?: Json | null
          context_type?: string | null
          created_at?: string | null
          feedback?: number | null
          id?: string
          messages?: Json
          tokens_used?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          bar_id?: string | null
          context_data?: Json | null
          context_type?: string | null
          created_at?: string | null
          feedback?: number | null
          id?: string
          messages?: Json
          tokens_used?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          bar_id: string
          confidence: number | null
          created_at: string | null
          data: Json | null
          expires_at: string | null
          id: string
          is_acted_upon: boolean | null
          is_read: boolean | null
          message: string
          title: string
          type: string | null
        }
        Insert: {
          bar_id: string
          confidence?: number | null
          created_at?: string | null
          data?: Json | null
          expires_at?: string | null
          id?: string
          is_acted_upon?: boolean | null
          is_read?: boolean | null
          message: string
          title: string
          type?: string | null
        }
        Update: {
          bar_id?: string
          confidence?: number | null
          created_at?: string | null
          data?: Json | null
          expires_at?: string | null
          id?: string
          is_acted_upon?: boolean | null
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          bar_id: string | null
          bar_name: string | null
          description: string
          event: string
          id: string
          ip_address: string | null
          metadata: Json | null
          related_entity_id: string | null
          related_entity_type: string | null
          severity: string
          timestamp: string
          user_agent: string | null
          user_id: string
          user_name: string
          user_role: string
        }
        Insert: {
          bar_id?: string | null
          bar_name?: string | null
          description: string
          event: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          severity: string
          timestamp?: string
          user_agent?: string | null
          user_id: string
          user_name: string
          user_role: string
        }
        Update: {
          bar_id?: string | null
          bar_name?: string | null
          description?: string
          event?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          severity?: string
          timestamp?: string
          user_agent?: string | null
          user_id?: string
          user_name?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_categories: {
        Row: {
          bar_id: string
          color: string | null
          created_at: string | null
          custom_color: string | null
          custom_name: string | null
          global_category_id: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_custom: boolean | null
          name: string | null
          order_index: number | null
          updated_at: string | null
        }
        Insert: {
          bar_id: string
          color?: string | null
          created_at?: string | null
          custom_color?: string | null
          custom_name?: string | null
          global_category_id?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_custom?: boolean | null
          name?: string | null
          order_index?: number | null
          updated_at?: string | null
        }
        Update: {
          bar_id?: string
          color?: string | null
          created_at?: string | null
          custom_color?: string | null
          custom_name?: string | null
          global_category_id?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_custom?: boolean | null
          name?: string | null
          order_index?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bar_categories_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_categories_global_category_id_fkey"
            columns: ["global_category_id"]
            isOneToOne: false
            referencedRelation: "global_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_members: {
        Row: {
          assigned_by: string | null
          bar_id: string
          id: string
          is_active: boolean | null
          joined_at: string | null
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          bar_id: string
          id?: string
          is_active?: boolean | null
          joined_at?: string | null
          role: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          bar_id?: string
          id?: string
          is_active?: boolean | null
          joined_at?: string | null
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bar_members_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_products: {
        Row: {
          alert_threshold: number | null
          bar_id: string
          created_at: string | null
          global_product_id: string | null
          id: string
          is_active: boolean | null
          is_custom_product: boolean | null
          local_category_id: string | null
          local_image: string | null
          local_name: string | null
          price: number
          stock: number | null
          updated_at: string | null
          volume: string | null
        }
        Insert: {
          alert_threshold?: number | null
          bar_id: string
          created_at?: string | null
          global_product_id?: string | null
          id?: string
          is_active?: boolean | null
          is_custom_product?: boolean | null
          local_category_id?: string | null
          local_image?: string | null
          local_name?: string | null
          price: number
          stock?: number | null
          updated_at?: string | null
          volume?: string | null
        }
        Update: {
          alert_threshold?: number | null
          bar_id?: string
          created_at?: string | null
          global_product_id?: string | null
          id?: string
          is_active?: boolean | null
          is_custom_product?: boolean | null
          local_category_id?: string | null
          local_image?: string | null
          local_name?: string | null
          price?: number
          stock?: number | null
          updated_at?: string | null
          volume?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bar_products_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_products_global_product_id_fkey"
            columns: ["global_product_id"]
            isOneToOne: false
            referencedRelation: "global_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bar_products_local_category_id_fkey"
            columns: ["local_category_id"]
            isOneToOne: false
            referencedRelation: "bar_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      bars: {
        Row: {
          address: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          owner_id: string | null
          phone: string | null
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          owner_id?: string | null
          phone?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          phone?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      capital_contributions: {
        Row: {
          amount: number
          bar_id: string
          created_at: string
          created_by: string
          date: string
          description: string
          id: string
          source: string
          source_details: string | null
        }
        Insert: {
          amount: number
          bar_id: string
          created_at?: string
          created_by: string
          date?: string
          description: string
          id?: string
          source: string
          source_details?: string | null
        }
        Update: {
          amount?: number
          bar_id?: string
          created_at?: string
          created_by?: string
          date?: string
          description?: string
          id?: string
          source?: string
          source_details?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "capital_contributions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_contributions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      consignments: {
        Row: {
          bar_id: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          created_by: string
          customer_name: string | null
          customer_phone: string | null
          expires_at: string
          id: string
          notes: string | null
          original_seller: string | null
          product_id: string
          product_name: string
          product_volume: string
          quantity: number
          sale_id: string
          status: string
          total_amount: number
        }
        Insert: {
          bar_id: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by: string
          customer_name?: string | null
          customer_phone?: string | null
          expires_at: string
          id?: string
          notes?: string | null
          original_seller?: string | null
          product_id: string
          product_name: string
          product_volume: string
          quantity: number
          sale_id: string
          status: string
          total_amount: number
        }
        Update: {
          bar_id?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string
          customer_name?: string | null
          customer_phone?: string | null
          expires_at?: string
          id?: string
          notes?: string | null
          original_seller?: string | null
          product_id?: string
          product_name?: string
          product_volume?: string
          quantity?: number
          sale_id?: string
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "consignments_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_original_seller_fkey"
            columns: ["original_seller"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "bar_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories_custom: {
        Row: {
          bar_id: string
          created_at: string
          created_by: string
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          bar_id: string
          created_at?: string
          created_by: string
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          bar_id?: string
          created_at?: string
          created_by?: string
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_custom_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_custom_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          bar_id: string
          category: string
          created_at: string
          created_by: string
          custom_category_id: string | null
          date: string
          description: string | null
          id: string
          notes: string | null
          related_supply_id: string | null
        }
        Insert: {
          amount: number
          bar_id: string
          category: string
          created_at?: string
          created_by: string
          custom_category_id?: string | null
          date?: string
          description?: string | null
          id?: string
          notes?: string | null
          related_supply_id?: string | null
        }
        Update: {
          amount?: number
          bar_id?: string
          category?: string
          created_at?: string
          created_by?: string
          custom_category_id?: string | null
          date?: string
          description?: string | null
          id?: string
          notes?: string | null
          related_supply_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_custom_category_id_fkey"
            columns: ["custom_category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories_custom"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_related_supply_id_fkey"
            columns: ["related_supply_id"]
            isOneToOne: false
            referencedRelation: "supplies"
            referencedColumns: ["id"]
          },
        ]
      }
      global_categories: {
        Row: {
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          is_system: boolean | null
          name: string
          order_index: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          order_index?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          order_index?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      global_products: {
        Row: {
          barcode: string | null
          brand: string | null
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          manufacturer: string | null
          name: string
          official_image: string | null
          subcategory: string | null
          suggested_price_max: number | null
          suggested_price_min: number | null
          updated_at: string | null
          volume: string
          volume_ml: number | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          manufacturer?: string | null
          name: string
          official_image?: string | null
          subcategory?: string | null
          suggested_price_max?: number | null
          suggested_price_min?: number | null
          updated_at?: string | null
          volume: string
          volume_ml?: number | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          manufacturer?: string | null
          name?: string
          official_image?: string | null
          subcategory?: string | null
          suggested_price_max?: number | null
          suggested_price_min?: number | null
          updated_at?: string | null
          volume?: string
          volume_ml?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "global_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      initial_balances: {
        Row: {
          amount: number
          bar_id: string
          created_at: string
          created_by: string
          date: string
          description: string
          id: string
          is_locked: boolean
        }
        Insert: {
          amount: number
          bar_id: string
          created_at?: string
          created_by: string
          date: string
          description: string
          id?: string
          is_locked?: boolean
        }
        Update: {
          amount?: number
          bar_id?: string
          created_at?: string
          created_by?: string
          date?: string
          description?: string
          id?: string
          is_locked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "initial_balances_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "initial_balances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          bar_id: string
          created_at: string | null
          created_by: string
          current_uses: number | null
          description: string | null
          discount_config: Json
          end_date: string | null
          id: string
          is_active: boolean | null
          max_total_uses: number | null
          max_uses_per_customer: number | null
          name: string
          priority: number | null
          start_date: string
          time_restrictions: Json | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          bar_id: string
          created_at?: string | null
          created_by: string
          current_uses?: number | null
          description?: string | null
          discount_config: Json
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          max_total_uses?: number | null
          max_uses_per_customer?: number | null
          name: string
          priority?: number | null
          start_date: string
          time_restrictions?: Json | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          bar_id?: string
          created_at?: string | null
          created_by?: string
          current_uses?: number | null
          description?: string | null
          discount_config?: Json
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          max_total_uses?: number | null
          max_uses_per_customer?: number | null
          name?: string
          priority?: number | null
          start_date?: string
          time_restrictions?: Json | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          auto_restock: boolean
          bar_id: string
          custom_refund: boolean | null
          custom_restock: boolean | null
          id: string
          is_refunded: boolean
          manual_restock_required: boolean
          notes: string | null
          original_seller: string | null
          product_id: string
          product_name: string
          product_volume: string
          quantity_returned: number
          quantity_sold: number
          reason: string
          refund_amount: number
          restocked_at: string | null
          returned_at: string
          returned_by: string
          sale_id: string
          status: string
        }
        Insert: {
          auto_restock?: boolean
          bar_id: string
          custom_refund?: boolean | null
          custom_restock?: boolean | null
          id?: string
          is_refunded?: boolean
          manual_restock_required?: boolean
          notes?: string | null
          original_seller?: string | null
          product_id: string
          product_name: string
          product_volume: string
          quantity_returned: number
          quantity_sold: number
          reason: string
          refund_amount: number
          restocked_at?: string | null
          returned_at?: string
          returned_by: string
          sale_id: string
          status: string
        }
        Update: {
          auto_restock?: boolean
          bar_id?: string
          custom_refund?: boolean | null
          custom_restock?: boolean | null
          id?: string
          is_refunded?: boolean
          manual_restock_required?: boolean
          notes?: string | null
          original_seller?: string | null
          product_id?: string
          product_name?: string
          product_volume?: string
          quantity_returned?: number
          quantity_sold?: number
          reason?: string
          refund_amount?: number
          restocked_at?: string | null
          returned_at?: string
          returned_by?: string
          sale_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_original_seller_fkey"
            columns: ["original_seller"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "bar_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_returned_by_fkey"
            columns: ["returned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      salaries: {
        Row: {
          amount: number
          bar_id: string
          created_at: string
          created_by: string
          id: string
          member_id: string
          paid_at: string
          period: string
        }
        Insert: {
          amount: number
          bar_id: string
          created_at?: string
          created_by: string
          id?: string
          member_id: string
          paid_at?: string
          period: string
        }
        Update: {
          amount?: number
          bar_id?: string
          created_at?: string
          created_by?: string
          id?: string
          member_id?: string
          paid_at?: string
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "salaries_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salaries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salaries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "bar_members"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_promotions: {
        Row: {
          applied_at: string | null
          discount_amount: number
          id: string
          items_affected: Json | null
          promotion_id: string
          sale_id: string
        }
        Insert: {
          applied_at?: string | null
          discount_amount: number
          id?: string
          items_affected?: Json | null
          promotion_id: string
          sale_id: string
        }
        Update: {
          applied_at?: string | null
          discount_amount?: number
          id?: string
          items_affected?: Json | null
          promotion_id?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_promotions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_promotions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          applied_promotions: Json | null
          bar_id: string
          created_at: string | null
          created_by: string | null
          customer_name: string | null
          customer_phone: string | null
          discount_total: number | null
          id: string
          items: Json
          notes: string | null
          payment_method: string
          rejected_by: string | null
          sold_by: string
          status: string | null
          subtotal: number
          total: number
          updated_at: string | null
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          applied_promotions?: Json | null
          bar_id: string
          created_at?: string | null
          created_by?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_total?: number | null
          id?: string
          items: Json
          notes?: string | null
          payment_method: string
          rejected_by?: string | null
          sold_by: string
          status?: string | null
          subtotal: number
          total: number
          updated_at?: string | null
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          applied_promotions?: Json | null
          bar_id?: string
          created_at?: string | null
          created_by?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_total?: number | null
          id?: string
          items?: Json
          notes?: string | null
          payment_method?: string
          rejected_by?: string | null
          sold_by?: string
          status?: string | null
          subtotal?: number
          total?: number
          updated_at?: string | null
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      supplies: {
        Row: {
          bar_id: string
          created_at: string | null
          id: string
          notes: string | null
          product_id: string
          quantity: number
          supplied_at: string | null
          supplied_by: string
          supplier_name: string | null
          supplier_phone: string | null
          total_cost: number
          unit_cost: number
        }
        Insert: {
          bar_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          supplied_at?: string | null
          supplied_by: string
          supplier_name?: string | null
          supplier_phone?: string | null
          total_cost: number
          unit_cost: number
        }
        Update: {
          bar_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          supplied_at?: string | null
          supplied_by?: string
          supplier_name?: string | null
          supplier_phone?: string | null
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplies_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplies_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "bar_products"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          first_login: boolean | null
          id: string
          is_active: boolean | null
          last_login_at: string | null
          name: string
          phone: string
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          first_login?: boolean | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          name: string
          phone: string
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          first_login?: boolean | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          name?: string
          phone?: string
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      bar_weekly_stats: {
        Row: {
          active_sellers: string[] | null
          avg_sale_value: number | null
          bar_id: string | null
          revenue: number | null
          sales_count: number | null
          total_discounts: number | null
          week: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auth_user_id: { Args: never; Returns: string }
      check_product_create_permission: {
        Args: { target_bar_id: string }
        Returns: boolean
      }
      get_user_role: { Args: { bar_id_param: string }; Returns: string }
      is_bar_member: { Args: { bar_id_param: string }; Returns: boolean }
      is_promoteur_or_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      setup_super_admin_bar: {
        Args: { p_user_id: string }
        Returns: {
          bar_id: string
          bar_name: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
