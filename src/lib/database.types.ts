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
      _migrations: {
        Row: {
          applied_at: string | null
          id: number
          name: string
        }
        Insert: {
          applied_at?: string | null
          id?: number
          name: string
        }
        Update: {
          applied_at?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
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
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "accounting_transactions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "admin_notifications_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "ai_conversations_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "ai_insights_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "ai_insights_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      app_feedback: {
        Row: {
          bar_id: string | null
          created_at: string
          email: string | null
          id: string
          message: string
          status: string
          type: string
          user_id: string | null
        }
        Insert: {
          bar_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          message: string
          status?: string
          type: string
          user_id?: string | null
        }
        Update: {
          bar_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          status?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_feedback_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "app_feedback_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "app_feedback_bar_id_fkey"
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
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "audit_logs_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "bar_categories_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
      bar_events: {
        Row: {
          bar_id: string
          created_at: string | null
          created_by: string
          event_date: string
          event_name: string
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          impact_multiplier: number | null
          is_active: boolean | null
          is_recurring: boolean | null
          notes: string | null
          recurrence_rule: string | null
          updated_at: string | null
        }
        Insert: {
          bar_id: string
          created_at?: string | null
          created_by: string
          event_date: string
          event_name: string
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          impact_multiplier?: number | null
          is_active?: boolean | null
          is_recurring?: boolean | null
          notes?: string | null
          recurrence_rule?: string | null
          updated_at?: string | null
        }
        Update: {
          bar_id?: string
          created_at?: string | null
          created_by?: string
          event_date?: string
          event_name?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          impact_multiplier?: number | null
          is_active?: boolean | null
          is_recurring?: boolean | null
          notes?: string | null
          recurrence_rule?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bar_events_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "bar_events_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "bar_events_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_members: {
        Row: {
          assigned_at: string | null
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
          assigned_at?: string | null
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
          assigned_at?: string | null
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
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "bar_members_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "bar_members_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bar_members_assigned_by"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bar_members_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_products: {
        Row: {
          alert_threshold: number | null
          bar_id: string
          created_at: string | null
          current_average_cost: number | null
          display_name: string
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
          current_average_cost?: number | null
          display_name: string
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
          current_average_cost?: number | null
          display_name?: string
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
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "bar_products_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
          {
            foreignKeyName: "fk_bar_products_local_category"
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
          closing_hour: number | null
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
          closing_hour?: number | null
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
          closing_hour?: number | null
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
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "capital_contributions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
          business_date: string
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
          server_id: string | null
          status: string
          total_amount: number
        }
        Insert: {
          bar_id: string
          business_date: string
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
          server_id?: string | null
          status: string
          total_amount: number
        }
        Update: {
          bar_id?: string
          business_date?: string
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
          server_id?: string | null
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "consignments_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "consignments_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
            foreignKeyName: "consignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "consignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_stats_mat"
            referencedColumns: ["product_id"]
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
          is_active: boolean
          name: string
        }
        Insert: {
          bar_id: string
          created_at?: string
          created_by: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          bar_id?: string
          created_at?: string
          created_by?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_custom_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "expense_categories_custom_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
          expense_date: string
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
          expense_date?: string
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
          expense_date?: string
          id?: string
          notes?: string | null
          related_supply_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "expenses_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
      feature_flags: {
        Row: {
          created_at: string | null
          description: string | null
          enabled: boolean | null
          expires_at: string | null
          key: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          expires_at?: string | null
          key: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          expires_at?: string | null
          key?: string
        }
        Relationships: []
      }
      global_catalog_audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_name: string | null
          entity_type: string
          id: string
          modified_by: string
          new_values: Json | null
          old_values: Json | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_name?: string | null
          entity_type: string
          id?: string
          modified_by: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_name?: string | null
          entity_type?: string
          id?: string
          modified_by?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "global_catalog_audit_log_modified_by_fkey"
            columns: ["modified_by"]
            isOneToOne: false
            referencedRelation: "users"
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
          is_active: boolean
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
          is_active?: boolean
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
          is_active?: boolean
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
          is_active: boolean
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
          is_active?: boolean
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
          is_active?: boolean
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
            foreignKeyName: "fk_global_products_category"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "global_categories"
            referencedColumns: ["name"]
          },
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
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "initial_balances_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
      materialized_view_refresh_log: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          refresh_completed_at: string | null
          refresh_started_at: string
          row_count: number | null
          status: string
          triggered_by: string | null
          view_name: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          refresh_completed_at?: string | null
          refresh_started_at?: string
          row_count?: number | null
          status: string
          triggered_by?: string | null
          view_name: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          refresh_completed_at?: string | null
          refresh_started_at?: string
          row_count?: number | null
          status?: string
          triggered_by?: string | null
          view_name?: string
        }
        Relationships: []
      }
      promotion_applications: {
        Row: {
          applied_at: string | null
          applied_by: string
          bar_id: string
          discount_amount: number
          discounted_price: number
          id: string
          original_price: number
          product_id: string
          promotion_id: string
          quantity_sold: number
          sale_id: string
        }
        Insert: {
          applied_at?: string | null
          applied_by: string
          bar_id: string
          discount_amount: number
          discounted_price: number
          id?: string
          original_price: number
          product_id: string
          promotion_id: string
          quantity_sold: number
          sale_id: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string
          bar_id?: string
          discount_amount?: number
          discounted_price?: number
          id?: string
          original_price?: number
          product_id?: string
          promotion_id?: string
          quantity_sold?: number
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_applications_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "promotion_applications_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "promotion_applications_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_applications_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_applications_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          bar_id: string
          bundle_price: number | null
          bundle_quantity: number | null
          created_at: string | null
          created_by: string
          current_uses: number | null
          description: string | null
          discount_amount: number | null
          discount_percentage: number | null
          end_date: string | null
          id: string
          is_recurring: boolean | null
          max_total_uses: number | null
          max_uses_per_customer: number | null
          name: string
          priority: number | null
          recurrence_days: number[] | null
          special_price: number | null
          start_date: string
          status: Database["public"]["Enums"]["promotion_status"] | null
          target_category_ids: string[] | null
          target_product_ids: string[] | null
          target_type: string
          time_end: string | null
          time_start: string | null
          type: Database["public"]["Enums"]["promotion_type"]
          updated_at: string | null
        }
        Insert: {
          bar_id: string
          bundle_price?: number | null
          bundle_quantity?: number | null
          created_at?: string | null
          created_by: string
          current_uses?: number | null
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          end_date?: string | null
          id?: string
          is_recurring?: boolean | null
          max_total_uses?: number | null
          max_uses_per_customer?: number | null
          name: string
          priority?: number | null
          recurrence_days?: number[] | null
          special_price?: number | null
          start_date: string
          status?: Database["public"]["Enums"]["promotion_status"] | null
          target_category_ids?: string[] | null
          target_product_ids?: string[] | null
          target_type: string
          time_end?: string | null
          time_start?: string | null
          type: Database["public"]["Enums"]["promotion_type"]
          updated_at?: string | null
        }
        Update: {
          bar_id?: string
          bundle_price?: number | null
          bundle_quantity?: number | null
          created_at?: string | null
          created_by?: string
          current_uses?: number | null
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          end_date?: string | null
          id?: string
          is_recurring?: boolean | null
          max_total_uses?: number | null
          max_uses_per_customer?: number | null
          name?: string
          priority?: number | null
          recurrence_days?: number[] | null
          special_price?: number | null
          start_date?: string
          status?: Database["public"]["Enums"]["promotion_status"] | null
          target_category_ids?: string[] | null
          target_product_ids?: string[] | null
          target_type?: string
          time_end?: string | null
          time_start?: string | null
          type?: Database["public"]["Enums"]["promotion_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "promotions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "promotions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          auto_restock: boolean
          bar_id: string
          business_date: string
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
          server_id: string | null
          status: string
        }
        Insert: {
          auto_restock?: boolean
          bar_id: string
          business_date: string
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
          server_id?: string | null
          status: string
        }
        Update: {
          auto_restock?: boolean
          bar_id?: string
          business_date?: string
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
          server_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "returns_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
            foreignKeyName: "returns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "returns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_stats_mat"
            referencedColumns: ["product_id"]
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
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "salaries_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
          business_date: string
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
          server_id: string | null
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
          business_date: string
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
          server_id?: string | null
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
          business_date?: string
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
          server_id?: string | null
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
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
          {
            foreignKeyName: "sales_validated_by_fkey"
            columns: ["validated_by"]
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
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "supplies_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
          {
            foreignKeyName: "supplies_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_stats"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "supplies_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_stats_mat"
            referencedColumns: ["product_id"]
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
      bar_ancillary_stats: {
        Row: {
          bar_id: string | null
          top_products_json: Json | null
          total_members: number | null
        }
        Relationships: []
      }
      bar_ancillary_stats_mat: {
        Row: {
          bar_id: string | null
          top_products_json: Json | null
          total_members: number | null
        }
        Relationships: []
      }
      bar_stats_multi_period: {
        Row: {
          bar_id: string | null
          revenue_30d: number | null
          revenue_7d: number | null
          revenue_today: number | null
          revenue_yesterday: number | null
          sales_30d: number | null
          sales_7d: number | null
          sales_today: number | null
          sales_yesterday: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_stats_multi_period_mat: {
        Row: {
          bar_id: string | null
          revenue_30d: number | null
          revenue_7d: number | null
          revenue_today: number | null
          revenue_yesterday: number | null
          sales_30d: number | null
          sales_7d: number | null
          sales_today: number | null
          sales_yesterday: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
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
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_sales_summary: {
        Row: {
          active_servers: number | null
          avg_basket_value: number | null
          bar_id: string | null
          card_revenue: number | null
          cash_revenue: number | null
          first_sale_time: string | null
          gross_revenue: number | null
          gross_subtotal: number | null
          last_sale_time: string | null
          mobile_revenue: number | null
          pending_count: number | null
          rejected_count: number | null
          sale_date: string | null
          sale_month: string | null
          sale_week: string | null
          total_discounts: number | null
          total_items_sold: number | null
          updated_at: string | null
          validated_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_sales_summary_mat: {
        Row: {
          active_servers: number | null
          avg_basket_value: number | null
          bar_id: string | null
          card_revenue: number | null
          cash_revenue: number | null
          first_sale_time: string | null
          gross_revenue: number | null
          gross_subtotal: number | null
          last_sale_time: string | null
          mobile_revenue: number | null
          pending_count: number | null
          rejected_count: number | null
          sale_date: string | null
          sale_month: string | null
          sale_week: string | null
          total_discounts: number | null
          total_items_sold: number | null
          updated_at: string | null
          validated_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      debouncing_metrics: {
        Row: {
          avg_duration_ms: number | null
          estimated_debounce_rate_percent: number | null
          forced_refreshes: number | null
          last_refresh: string | null
          manual_refreshes: number | null
          successful_refreshes: number | null
          trigger_refreshes: number | null
          view_name: string | null
        }
        Relationships: []
      }
      expenses_summary: {
        Row: {
          bar_id: string | null
          custom_expenses: number | null
          electricity_expenses: number | null
          expense_count: number | null
          expense_date: string | null
          expense_month: string | null
          expense_week: string | null
          first_expense_time: string | null
          investment_count: number | null
          investments: number | null
          last_expense_time: string | null
          maintenance_expenses: number | null
          operating_expenses: number | null
          supplies_cost: number | null
          supply_count: number | null
          supply_expenses: number | null
          total_expenses: number | null
          updated_at: string | null
          water_expenses: number | null
        }
        Relationships: []
      }
      expenses_summary_mat: {
        Row: {
          bar_id: string | null
          custom_expenses: number | null
          electricity_expenses: number | null
          expense_count: number | null
          expense_date: string | null
          expense_month: string | null
          expense_week: string | null
          first_expense_time: string | null
          investment_count: number | null
          investments: number | null
          last_expense_time: string | null
          maintenance_expenses: number | null
          operating_expenses: number | null
          supplies_cost: number | null
          supply_count: number | null
          supply_expenses: number | null
          total_expenses: number | null
          updated_at: string | null
          water_expenses: number | null
        }
        Relationships: []
      }
      materialized_view_metrics: {
        Row: {
          avg_duration_ms: number | null
          current_row_count: number | null
          failed_refreshes: number | null
          last_successful_refresh: string | null
          max_duration_ms: number | null
          min_duration_ms: number | null
          minutes_since_last_refresh: number | null
          successful_refreshes: number | null
          view_name: string | null
        }
        Relationships: []
      }
      product_sales_stats: {
        Row: {
          alert_threshold: number | null
          avg_purchase_cost: number | null
          bar_id: string | null
          current_stock: number | null
          daily_average: number | null
          days_since_creation: number | null
          days_with_sales: number | null
          days_without_sale: number | null
          last_sale_date: string | null
          product_created_at: string | null
          product_id: string | null
          product_name: string | null
          product_volume: string | null
          selling_price: number | null
          total_sold_30d: number | null
          total_transactions: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bar_products_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "bar_products_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "bar_products_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sales_stats_mat: {
        Row: {
          alert_threshold: number | null
          avg_purchase_cost: number | null
          bar_id: string | null
          current_stock: number | null
          daily_average: number | null
          days_since_creation: number | null
          days_with_sales: number | null
          days_without_sale: number | null
          last_sale_date: string | null
          product_created_at: string | null
          product_id: string | null
          product_name: string | null
          product_volume: string | null
          selling_price: number | null
          total_sold_30d: number | null
          total_transactions: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bar_products_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "bar_products_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "bar_products_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      salaries_summary: {
        Row: {
          avg_salary_amount: number | null
          bar_id: string | null
          first_payment_time: string | null
          last_payment_time: string | null
          max_salary_amount: number | null
          min_salary_amount: number | null
          payment_count: number | null
          payment_date: string | null
          payment_month: string | null
          payment_week: string | null
          total_salaries: number | null
          unique_members_paid: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salaries_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "salaries_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "salaries_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      salaries_summary_mat: {
        Row: {
          avg_salary_amount: number | null
          bar_id: string | null
          first_payment_time: string | null
          last_payment_time: string | null
          max_salary_amount: number | null
          min_salary_amount: number | null
          payment_count: number | null
          payment_date: string | null
          payment_month: string | null
          payment_week: string | null
          total_salaries: number | null
          unique_members_paid: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salaries_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "salaries_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "salaries_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      top_products_by_period: {
        Row: {
          avg_unit_price: number | null
          bar_id: string | null
          product_id: string | null
          product_name: string | null
          product_volume: string | null
          sale_date: string | null
          sale_month: string | null
          sale_week: string | null
          total_quantity: number | null
          total_quantity_gross: number | null
          total_quantity_returned: number | null
          total_refunded: number | null
          total_revenue: number | null
          total_revenue_gross: number | null
          transaction_count: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      top_products_by_period_mat: {
        Row: {
          avg_unit_price: number | null
          bar_id: string | null
          product_id: string | null
          product_name: string | null
          product_volume: string | null
          sale_date: string | null
          sale_month: string | null
          sale_week: string | null
          total_quantity: number | null
          total_quantity_gross: number | null
          total_quantity_returned: number | null
          total_refunded: number | null
          total_revenue: number | null
          total_revenue_gross: number | null
          transaction_count: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats"
            referencedColumns: ["bar_id"]
          },
          {
            foreignKeyName: "sales_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bar_ancillary_stats_mat"
            referencedColumns: ["bar_id"]
          },
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
      _get_target_user_id: {
        Args: { p_impersonating_user_id: string }
        Returns: string
      }
      _verify_super_admin_proxy: {
        Args: { p_acting_as_user_id: string; p_action: string }
        Returns: boolean
      }
      admin_as_create_sale: {
        Args: {
          p_acting_user_id: string
          p_bar_id: string
          p_business_date?: string
          p_customer_name?: string
          p_customer_phone?: string
          p_items: Json
          p_notes?: string
          p_payment_method: string
          p_status?: string
        }
        Returns: {
          applied_promotions: Json | null
          bar_id: string
          business_date: string
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
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_as_create_supply: {
        Args: {
          p_acting_user_id: string
          p_bar_id: string
          p_supply_data: Json
        }
        Returns: Json
      }
      admin_as_get_bar_members: {
        Args: { p_acting_user_id: string; p_bar_id: string }
        Returns: {
          bar_id: string
          id: string
          is_active: boolean
          role: string
          user_data: Json
          user_id: string
        }[]
      }
      admin_as_get_bar_products: {
        Args: { p_acting_user_id: string; p_bar_id: string }
        Returns: {
          alert_threshold: number
          bar_id: string
          category_name: string
          created_at: string
          display_name: string
          global_product_id: string
          global_product_name: string
          id: string
          is_active: boolean
          is_custom_product: boolean
          local_category_id: string
          local_image: string
          local_name: string
          official_image: string
          price: number
          stock: number
          updated_at: string
          volume: string
        }[]
      }
      admin_as_get_bar_sales: {
        Args: { p_acting_as_user_id: string; p_bar_id: string }
        Returns: Json
      }
      admin_as_get_sales_stats: {
        Args: {
          p_acting_as_user_id: string
          p_bar_id: string
          p_end_date?: string
          p_start_date?: string
        }
        Returns: Json
      }
      admin_as_get_top_products: {
        Args: {
          p_acting_user_id: string
          p_bar_id: string
          p_end_date: string
          p_limit?: number
          p_start_date: string
        }
        Returns: {
          avg_unit_price: number
          product_name: string
          product_volume: string
          total_quantity: number
          total_revenue: number
        }[]
      }
      admin_as_get_user_bars: {
        Args: { p_acting_as_user_id: string }
        Returns: {
          address: string
          closing_hour: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          owner_id: string
          phone: string
          settings: Json
        }[]
      }
      admin_as_manage_product: {
        Args: {
          p_acting_user_id: string
          p_action: string
          p_bar_id: string
          p_product_data: Json
        }
        Returns: Json
      }
      admin_as_manage_promotion: {
        Args: {
          p_acting_user_id: string
          p_action: string
          p_bar_id: string
          p_promo_data: Json
        }
        Returns: Json
      }
      admin_as_manage_team_member: {
        Args: {
          p_acting_user_id: string
          p_action: string
          p_bar_id: string
          p_email?: string
          p_role?: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_as_update_bar_settings: {
        Args: { p_acting_user_id: string; p_bar_id: string; p_settings: Json }
        Returns: Json
      }
      admin_as_update_stock:
        | {
            Args: {
              p_acting_as_user_id: string
              p_product_id: string
              p_quantity_change: number
            }
            Returns: {
              new_stock: number
              product_id: string
              updated_at: string
            }[]
          }
        | {
            Args: {
              p_acting_user_id: string
              p_bar_id: string
              p_product_id: string
              p_quantity_delta: number
              p_reason: string
            }
            Returns: {
              alert_threshold: number | null
              bar_id: string
              created_at: string | null
              current_average_cost: number | null
              display_name: string
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
            SetofOptions: {
              from: "*"
              to: "bar_products"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      admin_send_password_reset: { Args: { p_user_id: string }; Returns: Json }
      admin_update_user: {
        Args: {
          p_email?: string
          p_is_active?: boolean
          p_name?: string
          p_phone?: string
          p_user_id: string
        }
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          first_login: boolean
          id: string
          is_active: boolean
          last_login_at: string
          name: string
          phone: string
          updated_at: string
          username: string
        }[]
      }
      assign_bar_member: {
        Args: {
          p_assigned_by: string
          p_bar_id: string
          p_role: string
          p_user_id: string
        }
        Returns: Json
      }
      auth_user_id: { Args: never; Returns: string }
      auto_activate_scheduled_promotions: { Args: never; Returns: undefined }
      auto_expire_promotions: { Args: never; Returns: undefined }
      check_product_create_permission: {
        Args: { target_bar_id: string }
        Returns: boolean
      }
      cleanup_old_refresh_logs: { Args: never; Returns: number }
      complete_first_login: { Args: { p_user_id: string }; Returns: boolean }
      compute_bar_product_display_name: {
        Args: {
          p_global_product_id: string
          p_is_custom_product: boolean
          p_local_name: string
        }
        Returns: string
      }
      create_sale_with_promotions: {
        Args: {
          p_bar_id: string
          p_business_date?: string
          p_customer_name?: string
          p_customer_phone?: string
          p_items: Json
          p_notes?: string
          p_payment_method: string
          p_sold_by: string
          p_status?: string
        }
        Returns: {
          applied_promotions: Json | null
          bar_id: string
          business_date: string
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
        SetofOptions: {
          from: "*"
          to: "sales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_user_profile: {
        Args: {
          p_email: string
          p_name: string
          p_phone: string
          p_user_id: string
          p_username: string
        }
        Returns: {
          user_avatar_url: string
          user_created_at: string
          user_email: string
          user_first_login: boolean
          user_id: string
          user_is_active: boolean
          user_last_login_at: string
          user_name: string
          user_phone: string
          user_updated_at: string
          user_username: string
        }[]
      }
      debug_get_dashboard_stats: {
        Args: { p_period?: string }
        Returns: {
          end_timestamp: string
          now_utc_debug: string
          start_timestamp: string
          today_business_start_ts_debug: string
        }[]
      }
      decrement_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: undefined
      }
      force_refresh_view: { Args: { p_view_name: string }; Returns: string }
      get_bar_global_promotion_stats: {
        Args: { p_bar_id: string; p_end_date?: string; p_start_date?: string }
        Returns: {
          total_applications: number
          total_discount: number
          total_revenue: number
        }[]
      }
      get_bar_live_alerts: { Args: { p_bar_id: string }; Returns: number }
      get_bar_members: {
        Args: { p_bar_id: string; p_impersonating_user_id?: string }
        Returns: {
          assigned_at: string
          assigned_by: string
          bar_id: string
          id: string
          is_active: boolean
          role: string
          user_email: string
          user_id: string
          user_name: string
          user_phone: string
        }[]
      }
      get_bar_products: {
        Args: { p_bar_id: string; p_impersonating_user_id?: string }
        Returns: {
          alert_threshold: number
          bar_id: string
          category_name: string
          created_at: string
          display_name: string
          global_product_id: string
          global_product_name: string
          id: string
          is_active: boolean
          is_custom_product: boolean
          local_category_id: string
          local_image: string
          local_name: string
          official_image: string
          price: number
          stock: number
          updated_at: string
          volume: string
        }[]
      }
      get_bar_promotion_stats: {
        Args: { p_bar_id: string; p_end_date?: string; p_start_date?: string }
        Returns: {
          promotion_id: string
          promotion_name: string
          total_applications: number
          total_discount: number
          total_revenue: number
        }[]
      }
      get_current_business_date: { Args: never; Returns: string }
      get_dashboard_stats: {
        Args: { p_cache_buster?: string; p_period?: string }
        Returns: {
          active_bars_count: number
          active_users_count: number
          bars_count: number
          new_users_count: number
          sales_count: number
          total_revenue: number
        }[]
      }
      get_my_bars: {
        Args: never
        Returns: {
          address: string
          closing_hour: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          owner_id: string
          phone: string
          settings: Json
        }[]
      }
      get_paginated_audit_logs: {
        Args: {
          p_bar_filter?: string
          p_end_date?: string
          p_event_filter?: string
          p_limit: number
          p_page: number
          p_search_query?: string
          p_severity_filter?: string
          p_start_date?: string
        }
        Returns: {
          logs: Json
          total_count: number
        }[]
      }
      get_paginated_bars: {
        Args: {
          p_limit: number
          p_page: number
          p_search_query?: string
          p_sort_by?: string
          p_sort_order?: string
          p_status_filter?: string
        }
        Returns: {
          bars: Json
          total_count: number
        }[]
      }
      get_paginated_catalog_logs_for_admin: {
        Args: {
          p_action_filter?: string
          p_end_date?: string
          p_entity_filter?: string
          p_limit: number
          p_page: number
          p_search_query?: string
          p_start_date?: string
        }
        Returns: {
          action: string
          created_at: string
          entity_id: string
          entity_name: string
          entity_type: string
          id: string
          modified_by: string
          new_values: Json
          old_values: Json
          total_count: number
        }[]
      }
      get_paginated_users: {
        Args: {
          p_limit: number
          p_page: number
          p_role_filter?: string
          p_search_query?: string
        }
        Returns: {
          total_count: number
          users: Json
        }[]
      }
      get_unique_bars: {
        Args: never
        Returns: {
          id: string
          name: string
          owner_id: string
        }[]
      }
      get_user_bars: {
        Args: { p_impersonating_user_id?: string; p_user_id: string }
        Returns: {
          address: string
          closing_hour: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          owner_id: string
          phone: string
          settings: Json
        }[]
      }
      get_user_role: { Args: { bar_id_param: string }; Returns: string }
      get_view_freshness: {
        Args: { p_view_name: string }
        Returns: {
          is_stale: boolean
          last_refresh: string
          minutes_old: number
          view_name: string
        }[]
      }
      increment_promotion_uses: {
        Args: { p_promotion_id: string }
        Returns: undefined
      }
      increment_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: undefined
      }
      internal_log_audit_event: {
        Args: {
          p_bar_id: string
          p_description: string
          p_event: string
          p_metadata: Json
          p_related_entity_id: string
          p_related_entity_type: string
          p_severity: string
          p_user_id: string
        }
        Returns: undefined
      }
      is_bar_member: { Args: { bar_id_param: string }; Returns: boolean }
      is_impersonating: { Args: never; Returns: boolean }
      is_promoteur_or_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_user_super_admin: { Args: { p_user_id: string }; Returns: boolean }
      log_user_login: { Args: never; Returns: undefined }
      refresh_all_materialized_views: {
        Args: { p_triggered_by?: string }
        Returns: {
          log_id: string
          status: string
          view_name: string
        }[]
      }
      refresh_bar_stats_multi_period: { Args: never; Returns: undefined }
      refresh_expenses_summary: { Args: never; Returns: undefined }
      refresh_materialized_view_with_logging: {
        Args: { p_triggered_by?: string; p_view_name: string }
        Returns: string
      }
      refresh_product_sales_stats: { Args: never; Returns: undefined }
      refresh_salaries_summary: { Args: never; Returns: undefined }
      refresh_top_products_by_period: { Args: never; Returns: undefined }
      setup_promoter_bar: {
        Args: {
          p_address?: string
          p_bar_name: string
          p_owner_id: string
          p_phone?: string
          p_settings?: Json
        }
        Returns: Json
      }
      setup_super_admin_bar: {
        Args: { p_user_id: string }
        Returns: {
          bar_id: string
          bar_name: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      validate_and_get_impersonate_data: {
        Args: {
          p_bar_id: string
          p_impersonated_user_id: string
          p_super_admin_id: string
        }
        Returns: {
          bar_id: string
          error_message: string
          expires_at: string
          impersonated_user_email: string
          impersonated_user_id: string
          impersonated_user_role: string
          success: boolean
        }[]
      }
    }
    Enums: {
      event_type:
        | "holiday"
        | "anniversary"
        | "sports"
        | "theme_night"
        | "custom"
      promotion_status:
        | "draft"
        | "scheduled"
        | "active"
        | "paused"
        | "expired"
        | "cancelled"
      promotion_type:
        | "bundle"
        | "fixed_discount"
        | "percentage"
        | "special_price"
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
    Enums: {
      event_type: ["holiday", "anniversary", "sports", "theme_night", "custom"],
      promotion_status: [
        "draft",
        "scheduled",
        "active",
        "paused",
        "expired",
        "cancelled",
      ],
      promotion_type: [
        "bundle",
        "fixed_discount",
        "percentage",
        "special_price",
      ],
    },
  },
} as const
