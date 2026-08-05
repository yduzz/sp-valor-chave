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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      evaluations: {
        Row: {
          address: string
          created_at: string
          id: string
          per_sqm_avg: number | null
          per_sqm_max: number | null
          per_sqm_min: number | null
          rent_avg: number | null
          rent_max: number | null
          rent_min: number | null
          sale_avg: number | null
          sale_max: number | null
          sale_min: number | null
          selected_property_ids: string[]
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          per_sqm_avg?: number | null
          per_sqm_max?: number | null
          per_sqm_min?: number | null
          rent_avg?: number | null
          rent_max?: number | null
          rent_min?: number | null
          sale_avg?: number | null
          sale_max?: number | null
          sale_min?: number | null
          selected_property_ids: string[]
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          per_sqm_avg?: number | null
          per_sqm_max?: number | null
          per_sqm_min?: number | null
          rent_avg?: number | null
          rent_max?: number | null
          rent_min?: number | null
          sale_avg?: number | null
          sale_max?: number | null
          sale_min?: number | null
          selected_property_ids?: string[]
        }
        Relationships: []
      }
      market_indexes: {
        Row: {
          avg_price_per_sqm: number | null
          city: string | null
          competence: string
          created_at: string
          id: string
          metrics: Json
          monthly_variation: number | null
          neighborhood: string | null
          property_type: string | null
          report_id: string | null
          source: string
          updated_at: string
          yearly_variation: number | null
        }
        Insert: {
          avg_price_per_sqm?: number | null
          city?: string | null
          competence: string
          created_at?: string
          id?: string
          metrics?: Json
          monthly_variation?: number | null
          neighborhood?: string | null
          property_type?: string | null
          report_id?: string | null
          source: string
          updated_at?: string
          yearly_variation?: number | null
        }
        Update: {
          avg_price_per_sqm?: number | null
          city?: string | null
          competence?: string
          created_at?: string
          id?: string
          metrics?: Json
          monthly_variation?: number | null
          neighborhood?: string | null
          property_type?: string | null
          report_id?: string | null
          source?: string
          updated_at?: string
          yearly_variation?: number | null
        }
        Relationships: []
      }
      market_reports: {
        Row: {
          competence: string | null
          created_at: string
          file_hash: string | null
          file_size: number | null
          file_type: string | null
          id: string
          parsed: boolean
          source: string
          source_url: string
          storage_path: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          competence?: string | null
          created_at?: string
          file_hash?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          parsed?: boolean
          source: string
          source_url: string
          storage_path?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          competence?: string | null
          created_at?: string
          file_hash?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          parsed?: boolean
          source?: string
          source_url?: string
          storage_path?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      market_update_logs: {
        Row: {
          competence: string | null
          details: Json
          duration_ms: number | null
          executed_at: string
          id: string
          message: string | null
          records_imported: number
          source: string
          status: string
        }
        Insert: {
          competence?: string | null
          details?: Json
          duration_ms?: number | null
          executed_at?: string
          id?: string
          message?: string | null
          records_imported?: number
          source: string
          status: string
        }
        Update: {
          competence?: string | null
          details?: Json
          duration_ms?: number | null
          executed_at?: string
          id?: string
          message?: string | null
          records_imported?: number
          source?: string
          status?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          ad_link: string | null
          address: string
          area: number | null
          created_at: string
          fiscal_zone: string | null
          id: string
          matricula: string | null
          neighborhood: string | null
          price_per_sqm: number | null
          property_type: string | null
          proportion_pct: number | null
          transaction_date: string | null
          transaction_value: number | null
          transaction_value_full: number | null
          updated_at: string
          venal_reference: number | null
          venal_value: number
          year: number
        }
        Insert: {
          ad_link?: string | null
          address: string
          area?: number | null
          created_at?: string
          fiscal_zone?: string | null
          id?: string
          matricula?: string | null
          neighborhood?: string | null
          price_per_sqm?: number | null
          property_type?: string | null
          proportion_pct?: number | null
          transaction_date?: string | null
          transaction_value?: number | null
          transaction_value_full?: number | null
          updated_at?: string
          venal_reference?: number | null
          venal_value: number
          year: number
        }
        Update: {
          ad_link?: string | null
          address?: string
          area?: number | null
          created_at?: string
          fiscal_zone?: string | null
          id?: string
          matricula?: string | null
          neighborhood?: string | null
          price_per_sqm?: number | null
          property_type?: string | null
          proportion_pct?: number | null
          transaction_date?: string | null
          transaction_value?: number | null
          transaction_value_full?: number | null
          updated_at?: string
          venal_reference?: number | null
          venal_value?: number
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_addresses: {
        Args: { max_results?: number; search_term: string }
        Returns: {
          full_address: string
          match_count: number
          street_name: string
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
