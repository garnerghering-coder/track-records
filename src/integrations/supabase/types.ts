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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      community_submissions: {
        Row: {
          admin_notes: string | null
          category: Database["public"]["Enums"]["racing_category"] | null
          created_at: string
          event_date: string | null
          event_name: string
          id: string
          location: string | null
          parsed_entries: Json | null
          raw_data: string
          reviewed_at: string | null
          reviewed_by: string | null
          season_year: number
          series_name: string
          status: string
          submitted_by: string
        }
        Insert: {
          admin_notes?: string | null
          category?: Database["public"]["Enums"]["racing_category"] | null
          created_at?: string
          event_date?: string | null
          event_name: string
          id?: string
          location?: string | null
          parsed_entries?: Json | null
          raw_data: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          season_year: number
          series_name: string
          status?: string
          submitted_by: string
        }
        Update: {
          admin_notes?: string | null
          category?: Database["public"]["Enums"]["racing_category"] | null
          created_at?: string
          event_date?: string | null
          event_name?: string
          id?: string
          location?: string | null
          parsed_entries?: Json | null
          raw_data?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          season_year?: number
          series_name?: string
          status?: string
          submitted_by?: string
        }
        Relationships: []
      }
      dismissed_duplicates: {
        Row: {
          dismissed_at: string
          dismissed_by: string | null
          driver_id_1: string
          driver_id_2: string
          id: string
        }
        Insert: {
          dismissed_at?: string
          dismissed_by?: string | null
          driver_id_1: string
          driver_id_2: string
          id?: string
        }
        Update: {
          dismissed_at?: string
          dismissed_by?: string | null
          driver_id_1?: string
          driver_id_2?: string
          id?: string
        }
        Relationships: []
      }
      driver_profiles: {
        Row: {
          bio: string | null
          created_at: string
          date_of_birth: string | null
          first_name: string
          id: string
          is_claimed: boolean
          last_name: string
          license_grade: string | null
          license_issuing_body: string | null
          license_type: string | null
          nationality: string | null
          photo_url: string | null
          primary_category:
            | Database["public"]["Enums"]["racing_category"]
            | null
          social_instagram: string | null
          social_linkedin: string | null
          social_twitter: string | null
          social_website: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name: string
          id?: string
          is_claimed?: boolean
          last_name: string
          license_grade?: string | null
          license_issuing_body?: string | null
          license_type?: string | null
          nationality?: string | null
          photo_url?: string | null
          primary_category?:
            | Database["public"]["Enums"]["racing_category"]
            | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_twitter?: string | null
          social_website?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name?: string
          id?: string
          is_claimed?: boolean
          last_name?: string
          license_grade?: string | null
          license_issuing_body?: string | null
          license_type?: string | null
          nationality?: string | null
          photo_url?: string | null
          primary_category?:
            | Database["public"]["Enums"]["racing_category"]
            | null
          social_instagram?: string | null
          social_linkedin?: string | null
          social_twitter?: string | null
          social_website?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      import_sources: {
        Row: {
          created_at: string
          created_by: string | null
          frequency: string
          id: string
          is_active: boolean
          last_run_at: string | null
          last_status: string | null
          name: string
          series_hint: string | null
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_status?: string | null
          name: string
          series_hint?: string | null
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          series_hint?: string | null
          url?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          type: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          type?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          type?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      profile_claim_requests: {
        Row: {
          created_at: string
          document_url: string | null
          driver_profile_id: string
          id: string
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["claim_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          document_url?: string | null
          driver_profile_id: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          document_url?: string | null
          driver_profile_id?: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["claim_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_claim_requests_driver_profile_id_fkey"
            columns: ["driver_profile_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      race_entries: {
        Row: {
          car_number: string | null
          class_position: number | null
          created_at: string
          finishing_position: number | null
          gap_to_class_leader: string | null
          gap_to_leader: string | null
          id: string
          laps_completed: number | null
          notes: string | null
          organization_id: string | null
          pit_stops: number | null
          race_class: string | null
          race_event_id: string
          status: string | null
          team_name: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          car_number?: string | null
          class_position?: number | null
          created_at?: string
          finishing_position?: number | null
          gap_to_class_leader?: string | null
          gap_to_leader?: string | null
          id?: string
          laps_completed?: number | null
          notes?: string | null
          organization_id?: string | null
          pit_stops?: number | null
          race_class?: string | null
          race_event_id: string
          status?: string | null
          team_name?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          car_number?: string | null
          class_position?: number | null
          created_at?: string
          finishing_position?: number | null
          gap_to_class_leader?: string | null
          gap_to_leader?: string | null
          id?: string
          laps_completed?: number | null
          notes?: string | null
          organization_id?: string | null
          pit_stops?: number | null
          race_class?: string | null
          race_event_id?: string
          status?: string | null
          team_name?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "race_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_entries_race_event_id_fkey"
            columns: ["race_event_id"]
            isOneToOne: false
            referencedRelation: "race_events"
            referencedColumns: ["id"]
          },
        ]
      }
      race_entry_drivers: {
        Row: {
          created_at: string
          driver_profile_id: string
          id: string
          race_entry_id: string
        }
        Insert: {
          created_at?: string
          driver_profile_id: string
          id?: string
          race_entry_id: string
        }
        Update: {
          created_at?: string
          driver_profile_id?: string
          id?: string
          race_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_entry_drivers_driver_profile_id_fkey"
            columns: ["driver_profile_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_entry_drivers_race_entry_id_fkey"
            columns: ["race_entry_id"]
            isOneToOne: false
            referencedRelation: "race_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      race_events: {
        Row: {
          category: Database["public"]["Enums"]["racing_category"] | null
          created_at: string
          event_date: string | null
          event_name: string
          id: string
          location: string | null
          notes: string | null
          season_year: number
          series_name: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["racing_category"] | null
          created_at?: string
          event_date?: string | null
          event_name: string
          id?: string
          location?: string | null
          notes?: string | null
          season_year: number
          series_name: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["racing_category"] | null
          created_at?: string
          event_date?: string | null
          event_name?: string
          id?: string
          location?: string | null
          notes?: string | null
          season_year?: number
          series_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      race_results: {
        Row: {
          category: Database["public"]["Enums"]["racing_category"] | null
          championship_position: number | null
          created_at: string
          driver_profile_id: string
          event_name: string | null
          finishing_position: number | null
          id: string
          notes: string | null
          season_year: number
          series_name: string
          submitted_by: string | null
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["racing_category"] | null
          championship_position?: number | null
          created_at?: string
          driver_profile_id: string
          event_name?: string | null
          finishing_position?: number | null
          id?: string
          notes?: string | null
          season_year: number
          series_name: string
          submitted_by?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["racing_category"] | null
          championship_position?: number | null
          created_at?: string
          driver_profile_id?: string
          event_name?: string | null
          finishing_position?: number | null
          id?: string
          notes?: string | null
          season_year?: number
          series_name?: string
          submitted_by?: string | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "race_results_driver_profile_id_fkey"
            columns: ["driver_profile_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          id: string
          message: string
          report_type: string
          reporter_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          report_type: string
          reporter_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          report_type?: string
          reporter_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "driver" | "team_sponsor" | "admin"
      claim_status: "pending" | "approved" | "rejected"
      racing_category:
        | "karting"
        | "single_seater"
        | "gt"
        | "touring_car"
        | "sports_car"
        | "rally"
        | "endurance"
        | "formula"
        | "stock_car"
        | "other"
      verification_status: "pending" | "verified" | "rejected"
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
      app_role: ["driver", "team_sponsor", "admin"],
      claim_status: ["pending", "approved", "rejected"],
      racing_category: [
        "karting",
        "single_seater",
        "gt",
        "touring_car",
        "sports_car",
        "rally",
        "endurance",
        "formula",
        "stock_car",
        "other",
      ],
      verification_status: ["pending", "verified", "rejected"],
    },
  },
} as const
