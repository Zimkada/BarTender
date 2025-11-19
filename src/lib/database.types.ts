export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          username: string
          password_hash: string
          name: string
          phone: string
          avatar_url: string | null
          is_active: boolean
          first_login: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          username: string
          password_hash: string
          name: string
          phone: string
          avatar_url?: string | null
          is_active?: boolean
          first_login?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          password_hash?: string
          name?: string
          phone?: string
          avatar_url?: string | null
          is_active?: boolean
          first_login?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      bars: {
        Row: {
          id: string
          name: string
          owner_id: string
          address: string | null
          phone: string | null
          logo_url: string | null
          settings: Json | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          owner_id: string
          address?: string | null
          phone?: string | null
          logo_url?: string | null
          settings?: Json | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          owner_id?: string
          address?: string | null
          phone?: string | null
          logo_url?: string | null
          settings?: Json | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      bar_members: {
        Row: {
          id: string
          bar_id: string
          user_id: string
          role: 'super_admin' | 'promoteur' | 'gerant' | 'serveur'
          assigned_by: string
          is_active: boolean
          joined_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          user_id: string
          role: 'super_admin' | 'promoteur' | 'gerant' | 'serveur'
          assigned_by: string
          is_active?: boolean
          joined_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          user_id?: string
          role?: 'super_admin' | 'promoteur' | 'gerant' | 'serveur'
          assigned_by?: string
          is_active?: boolean
          joined_at?: string
          updated_at?: string
        }
      }
      global_categories: {
        Row: {
          id: string
          name: string
          color: string
          icon: string | null
          order_index: number
          is_system: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          color?: string
          icon?: string | null
          order_index?: number
          is_system?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          color?: string
          icon?: string | null
          order_index?: number
          is_system?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      global_products: {
        Row: {
          id: string
          name: string
          brand: string | null
          volume: string
          volume_ml: number | null
          category: string
          official_image: string | null
          barcode: string | null
          suggested_price_min: number | null
          suggested_price_max: number | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          brand?: string | null
          volume: string
          volume_ml?: number | null
          category: string
          official_image?: string | null
          barcode?: string | null
          suggested_price_min?: number | null
          suggested_price_max?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          brand?: string | null
          volume?: string
          volume_ml?: number | null
          category?: string
          official_image?: string | null
          barcode?: string | null
          suggested_price_min?: number | null
          suggested_price_max?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      bar_categories: {
        Row: {
          id: string
          bar_id: string
          name: string
          color: string
          icon: string | null
          order_index: number
          is_custom: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          name: string
          color?: string
          icon?: string | null
          order_index?: number
          is_custom?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          name?: string
          color?: string
          icon?: string | null
          order_index?: number
          is_custom?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      bar_products: {
        Row: {
          id: string
          bar_id: string
          global_product_id: string | null
          local_name: string | null
          local_image: string | null
          local_category_id: string | null
          price: number
          stock: number
          alert_threshold: number
          is_custom_product: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          global_product_id?: string | null
          local_name?: string | null
          local_image?: string | null
          local_category_id?: string | null
          price: number
          stock?: number
          alert_threshold?: number
          is_custom_product?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          global_product_id?: string | null
          local_name?: string | null
          local_image?: string | null
          local_category_id?: string | null
          price?: number
          stock?: number
          alert_threshold?: number
          is_custom_product?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      supplies: {
        Row: {
          id: string
          bar_id: string
          product_id: string
          quantity: number
          unit_cost: number
          total_cost: number
          supplier_name: string | null
          supplier_phone: string | null
          notes: string | null
          supplied_by: string
          supplied_at: string
          created_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          product_id: string
          quantity: number
          unit_cost: number
          total_cost: number
          supplier_name?: string | null
          supplier_phone?: string | null
          notes?: string | null
          supplied_by: string
          supplied_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          product_id?: string
          quantity?: number
          unit_cost?: number
          total_cost?: number
          supplier_name?: string | null
          supplier_phone?: string | null
          notes?: string | null
          supplied_by?: string
          supplied_at?: string
          created_at?: string
        }
      }
      promotions: {
        Row: {
          id: string
          bar_id: string
          name: string
          description: string | null
          type: 'quantity_discount' | 'time_based' | 'product_discount' | 'bundle_price' | 'buy_x_get_y'
          discount_config: Json
          start_date: string
          end_date: string | null
          is_active: boolean
          priority: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          name: string
          description?: string | null
          type: 'quantity_discount' | 'time_based' | 'product_discount' | 'bundle_price' | 'buy_x_get_y'
          discount_config: Json
          start_date: string
          end_date?: string | null
          is_active?: boolean
          priority?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          name?: string
          description?: string | null
          type?: 'quantity_discount' | 'time_based' | 'product_discount' | 'bundle_price' | 'buy_x_get_y'
          discount_config?: Json
          start_date?: string
          end_date?: string | null
          is_active?: boolean
          priority?: number
          created_at?: string
          updated_at?: string
        }
      }
      sales: {
        Row: {
          id: string
          bar_id: string
          items: Json
          subtotal: number
          discount_total: number
          total: number
          payment_method: 'cash' | 'mobile_money' | 'card' | 'credit'
          status: 'pending' | 'validated' | 'rejected'
          sold_by: string
          validated_by: string | null
          customer_name: string | null
          customer_phone: string | null
          notes: string | null
          applied_promotions: Json | null
          created_at: string
          validated_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          items: Json
          subtotal: number
          discount_total?: number
          total: number
          payment_method: 'cash' | 'mobile_money' | 'card' | 'credit'
          status?: 'pending' | 'validated' | 'rejected'
          sold_by: string
          validated_by?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          notes?: string | null
          applied_promotions?: Json | null
          created_at?: string
          validated_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          items?: Json
          subtotal?: number
          discount_total?: number
          total?: number
          payment_method?: 'cash' | 'mobile_money' | 'card' | 'credit'
          status?: 'pending' | 'validated' | 'rejected'
          sold_by?: string
          validated_by?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          notes?: string | null
          applied_promotions?: Json | null
          created_at?: string
          validated_at?: string | null
          updated_at?: string
        }
      }
      sale_promotions: {
        Row: {
          id: string
          sale_id: string
          promotion_id: string
          discount_amount: number
          created_at: string
        }
        Insert: {
          id?: string
          sale_id: string
          promotion_id: string
          discount_amount: number
          created_at?: string
        }
        Update: {
          id?: string
          sale_id?: string
          promotion_id?: string
          discount_amount?: number
          created_at?: string
        }
      }
      returns: {
        Row: {
          id: string
          bar_id: string
          product_id: string
          quantity: number
          reason: string | null
          returned_by: string
          returned_at: string
          created_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          product_id: string
          quantity: number
          reason?: string | null
          returned_by: string
          returned_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          returned_by?: string
          returned_at?: string
          created_at?: string
        }
      }
      consignments: {
        Row: {
          id: string
          bar_id: string
          product_id: string
          quantity_out: number
          quantity_returned: number
          unit_price: number
          customer_name: string
          customer_phone: string | null
          status: 'active' | 'returned' | 'sold'
          consigned_by: string
          consigned_at: string
          returned_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          product_id: string
          quantity_out: number
          quantity_returned?: number
          unit_price: number
          customer_name: string
          customer_phone?: string | null
          status?: 'active' | 'returned' | 'sold'
          consigned_by: string
          consigned_at?: string
          returned_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          product_id?: string
          quantity_out?: number
          quantity_returned?: number
          unit_price?: number
          customer_name?: string
          customer_phone?: string | null
          status?: 'active' | 'returned' | 'sold'
          consigned_by?: string
          consigned_at?: string
          returned_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      expense_categories_custom: {
        Row: {
          id: string
          bar_id: string
          name: string
          description: string | null
          color: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          name: string
          description?: string | null
          color?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          name?: string
          description?: string | null
          color?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      expenses: {
        Row: {
          id: string
          bar_id: string
          category: string
          custom_category_id: string | null
          amount: number
          description: string | null
          receipt_url: string | null
          recorded_by: string
          expense_date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          category: string
          custom_category_id?: string | null
          amount: number
          description?: string | null
          receipt_url?: string | null
          recorded_by: string
          expense_date?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          category?: string
          custom_category_id?: string | null
          amount?: number
          description?: string | null
          receipt_url?: string | null
          recorded_by?: string
          expense_date?: string
          created_at?: string
          updated_at?: string
        }
      }
      salaries: {
        Row: {
          id: string
          bar_id: string
          employee_id: string | null
          employee_name: string
          role: string
          amount: number
          period_start: string
          period_end: string
          payment_date: string | null
          status: 'pending' | 'paid' | 'cancelled'
          notes: string | null
          recorded_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          employee_id?: string | null
          employee_name: string
          role: string
          amount: number
          period_start: string
          period_end: string
          payment_date?: string | null
          status?: 'pending' | 'paid' | 'cancelled'
          notes?: string | null
          recorded_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          employee_id?: string | null
          employee_name?: string
          role?: string
          amount?: number
          period_start?: string
          period_end?: string
          payment_date?: string | null
          status?: 'pending' | 'paid' | 'cancelled'
          notes?: string | null
          recorded_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      initial_balances: {
        Row: {
          id: string
          bar_id: string
          amount: number
          recorded_by: string
          balance_date: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          amount: number
          recorded_by: string
          balance_date?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          amount?: number
          recorded_by?: string
          balance_date?: string
          notes?: string | null
          created_at?: string
        }
      }
      capital_contributions: {
        Row: {
          id: string
          bar_id: string
          contributor_id: string | null
          contributor_name: string
          amount: number
          contribution_date: string
          notes: string | null
          recorded_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          contributor_id?: string | null
          contributor_name: string
          amount: number
          contribution_date?: string
          notes?: string | null
          recorded_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          contributor_id?: string | null
          contributor_name?: string
          amount?: number
          contribution_date?: string
          notes?: string | null
          recorded_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      accounting_transactions: {
        Row: {
          id: string
          bar_id: string
          type: 'sale' | 'supply' | 'expense' | 'salary' | 'return' | 'consignment' | 'initial_balance' | 'capital_contribution'
          amount: number
          reference_id: string | null
          description: string | null
          recorded_by: string
          transaction_date: string
          created_at: string
        }
        Insert: {
          id?: string
          bar_id: string
          type: 'sale' | 'supply' | 'expense' | 'salary' | 'return' | 'consignment' | 'initial_balance' | 'capital_contribution'
          amount: number
          reference_id?: string | null
          description?: string | null
          recorded_by: string
          transaction_date?: string
          created_at?: string
        }
        Update: {
          id?: string
          bar_id?: string
          type?: 'sale' | 'supply' | 'expense' | 'salary' | 'return' | 'consignment' | 'initial_balance' | 'capital_contribution'
          amount?: number
          reference_id?: string | null
          description?: string | null
          recorded_by?: string
          transaction_date?: string
          created_at?: string
        }
      }
      admin_notifications: {
        Row: {
          id: string
          type: 'new_bar' | 'user_issue' | 'payment_due' | 'system_alert'
          title: string
          message: string
          related_bar_id: string | null
          related_user_id: string | null
          is_read: boolean
          priority: 'low' | 'medium' | 'high' | 'urgent'
          created_at: string
          read_at: string | null
        }
        Insert: {
          id?: string
          type: 'new_bar' | 'user_issue' | 'payment_due' | 'system_alert'
          title: string
          message: string
          related_bar_id?: string | null
          related_user_id?: string | null
          is_read?: boolean
          priority?: 'low' | 'medium' | 'high' | 'urgent'
          created_at?: string
          read_at?: string | null
        }
        Update: {
          id?: string
          type?: 'new_bar' | 'user_issue' | 'payment_due' | 'system_alert'
          title?: string
          message?: string
          related_bar_id?: string | null
          related_user_id?: string | null
          is_read?: boolean
          priority?: 'low' | 'medium' | 'high' | 'urgent'
          created_at?: string
          read_at?: string | null
        }
      }
      audit_logs: {
        Row: {
          id: string
          bar_id: string | null
          user_id: string
          action: string
          table_name: string | null
          record_id: string | null
          old_data: Json | null
          new_data: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          bar_id?: string | null
          user_id: string
          action: string
          table_name?: string | null
          record_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          bar_id?: string | null
          user_id?: string
          action?: string
          table_name?: string | null
          record_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
      ai_conversations: {
        Row: {
          id: string
          user_id: string
          bar_id: string | null
          messages: Json
          context_type: string | null
          context_data: Json | null
          created_at: string
          updated_at: string
          tokens_used: number | null
          feedback: number | null
        }
        Insert: {
          id?: string
          user_id: string
          bar_id?: string | null
          messages: Json
          context_type?: string | null
          context_data?: Json | null
          created_at?: string
          updated_at?: string
          tokens_used?: number | null
          feedback?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          bar_id?: string | null
          messages?: Json
          context_type?: string | null
          context_data?: Json | null
          created_at?: string
          updated_at?: string
          tokens_used?: number | null
          feedback?: number | null
        }
      }
      ai_insights: {
        Row: {
          id: string
          bar_id: string
          type: 'prediction' | 'recommendation' | 'alert' | 'analysis'
          title: string
          message: string
          confidence: number | null
          data: Json | null
          is_read: boolean
          is_acted_upon: boolean
          created_at: string
          read_at: string | null
          acted_at: string | null
        }
        Insert: {
          id?: string
          bar_id: string
          type: 'prediction' | 'recommendation' | 'alert' | 'analysis'
          title: string
          message: string
          confidence?: number | null
          data?: Json | null
          is_read?: boolean
          is_acted_upon?: boolean
          created_at?: string
          read_at?: string | null
          acted_at?: string | null
        }
        Update: {
          id?: string
          bar_id?: string
          type?: 'prediction' | 'recommendation' | 'alert' | 'analysis'
          title?: string
          message?: string
          confidence?: number | null
          data?: Json | null
          is_read?: boolean
          is_acted_upon?: boolean
          created_at?: string
          read_at?: string | null
          acted_at?: string | null
        }
      }
    }
    Views: {
      bar_weekly_stats: {
        Row: {
          bar_id: string | null
          week: string | null
          sales_count: number | null
          revenue: number | null
          total_discounts: number | null
          avg_sale_value: number | null
        }
      }
    }
    Functions: {
      auth_user_id: {
        Args: Record<string, never>
        Returns: string
      }
      is_super_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      is_bar_member: {
        Args: {
          bar_id_param: string
        }
        Returns: boolean
      }
      get_user_role: {
        Args: {
          bar_id_param: string
        }
        Returns: string
      }
      is_promoteur_or_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
