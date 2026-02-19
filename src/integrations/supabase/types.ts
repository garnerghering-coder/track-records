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
      ai_api_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          last_used_at: string | null
          model_name: string
          priority: number
          provider_url: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          last_used_at?: string | null
          model_name?: string
          priority?: number
          provider_url?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          last_used_at?: string | null
          model_name?: string
          priority?: number
          provider_url?: string
        }
        Relationships: []
      }
      car_models: {
        Row: {
          category: Database["public"]["Enums"]["racing_category"] | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          manufacturer: string | null
          name: string
          updated_at: string
          website: string | null
          year_introduced: number | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["racing_category"] | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          manufacturer?: string | null
          name: string
          updated_at?: string
          website?: string | null
          year_introduced?: number | null
        }
        Update: {
          category?: Database["public"]["Enums"]["racing_category"] | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          manufacturer?: string | null
          name?: string
          updated_at?: string
          website?: string | null
          year_introduced?: number | null
        }
        Relationships: []
      }
      circuits: {
        Row: {
          country: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          lap_record_car_model_id: string | null
          lap_record_driver_id: string | null
          lap_record_time: string | null
          lap_record_year: number | null
          length_km: number | null
          location: string | null
          name: string
          turns: number | null
          updated_at: string
          website: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          lap_record_car_model_id?: string | null
          lap_record_driver_id?: string | null
          lap_record_time?: string | null
          lap_record_year?: number | null
          length_km?: number | null
          location?: string | null
          name: string
          turns?: number | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          lap_record_car_model_id?: string | null
          lap_record_driver_id?: string | null
          lap_record_time?: string | null
          lap_record_year?: number | null
          length_km?: number | null
          location?: string | null
          name?: string
          turns?: number | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "circuits_lap_record_car_model_id_fkey"
            columns: ["lap_record_car_model_id"]
            isOneToOne: false
            referencedRelation: "car_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circuits_lap_record_driver_id_fkey"
            columns: ["lap_record_driver_id"]
            isOneToOne: false
            referencedRelation: "driver_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      discovery_jobs: {
        Row: {
          created_at: string
          created_by: string
          events_failed: number
          events_found: number | null
          events_imported: number
          events_no_url: number
          events_skipped: number
          id: string
          progress_log: Json
          season_year: number
          series_name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          events_failed?: number
          events_found?: number | null
          events_imported?: number
          events_no_url?: number
          events_skipped?: number
          id?: string
          progress_log?: Json
          season_year: number
          series_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          events_failed?: number
          events_found?: number | null
          events_imported?: number
          events_no_url?: number
          events_skipped?: number
          id?: string
          progress_log?: Json
          season_year?: number
          series_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      dismissed_circuit_duplicates: {
        Row: {
          circuit_id_1: string
          circuit_id_2: string
          dismissed_at: string
          dismissed_by: string | null
          id: string
        }
        Insert: {
          circuit_id_1: string
          circuit_id_2: string
          dismissed_at?: string
          dismissed_by?: string | null
          id?: string
        }
        Update: {
          circuit_id_1?: string
          circuit_id_2?: string
          dismissed_at?: string
          dismissed_by?: string | null
          id?: string
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
      dismissed_team_duplicates: {
        Row: {
          dismissed_at: string
          dismissed_by: string | null
          id: string
          team_id_1: string
          team_id_2: string
        }
        Insert: {
          dismissed_at?: string
          dismissed_by?: string | null
          id?: string
          team_id_1: string
          team_id_2: string
        }
        Update: {
          dismissed_at?: string
          dismissed_by?: string | null
          id?: string
          team_id_1?: string
          team_id_2?: string
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
      edit_queue: {
        Row: {
          admin_notes: string | null
          created_at: string
          edit_type: string
          id: string
          previous_data: Json | null
          proposed_data: Json
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string
          target_id: string | null
          target_table: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          edit_type: string
          id?: string
          previous_data?: Json | null
          proposed_data: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by: string
          target_id?: string | null
          target_table: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          edit_type?: string
          id?: string
          previous_data?: Json | null
          proposed_data?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string
          target_id?: string | null
          target_table?: string
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
          car_model_id: string | null
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
          team_profile_id: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          car_model_id?: string | null
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
          team_profile_id?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          car_model_id?: string | null
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
          team_profile_id?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "race_entries_car_model_id_fkey"
            columns: ["car_model_id"]
            isOneToOne: false
            referencedRelation: "car_models"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "race_entries_team_profile_id_fkey"
            columns: ["team_profile_id"]
            isOneToOne: false
            referencedRelation: "team_profiles"
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
          circuit_id: string | null
          created_at: string
          event_date: string | null
          event_name: string
          id: string
          location: string | null
          notes: string | null
          season_year: number
          series_id: string | null
          series_name: string
          ticket_url: string | null
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["racing_category"] | null
          circuit_id?: string | null
          created_at?: string
          event_date?: string | null
          event_name: string
          id?: string
          location?: string | null
          notes?: string | null
          season_year: number
          series_id?: string | null
          series_name: string
          ticket_url?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["racing_category"] | null
          circuit_id?: string | null
          created_at?: string
          event_date?: string | null
          event_name?: string
          id?: string
          location?: string | null
          notes?: string | null
          season_year?: number
          series_id?: string | null
          series_name?: string
          ticket_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_events_circuit_id_fkey"
            columns: ["circuit_id"]
            isOneToOne: false
            referencedRelation: "circuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
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
      search_aliases: {
        Row: {
          alias: string
          canonical: string
          entity_type: string
          id: string
        }
        Insert: {
          alias: string
          canonical: string
          entity_type: string
          id?: string
        }
        Update: {
          alias?: string
          canonical?: string
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      series: {
        Row: {
          category: Database["public"]["Enums"]["racing_category"] | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          updated_at: string
          website: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["racing_category"] | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["racing_category"] | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      team_profiles: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          nationality: string | null
          primary_category:
            | Database["public"]["Enums"]["racing_category"]
            | null
          updated_at: string
          website: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          nationality?: string | null
          primary_category?:
            | Database["public"]["Enums"]["racing_category"]
            | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          nationality?: string | null
          primary_category?:
            | Database["public"]["Enums"]["racing_category"]
            | null
          updated_at?: string
          website?: string | null
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
      v2_cars: {
        Row: {
          created_at: string
          id: string
          manufacturer: string | null
          model_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          manufacturer?: string | null
          model_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          manufacturer?: string | null
          model_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      v2_circuits: {
        Row: {
          country: string | null
          created_at: string
          id: string
          layout_image_url: string | null
          location: string | null
          name: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          layout_image_url?: string | null
          location?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          layout_image_url?: string | null
          location?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      v2_drivers: {
        Row: {
          created_at: string
          date_of_birth: string | null
          full_name: string
          id: string
          nationality: string | null
          short_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          full_name: string
          id?: string
          nationality?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          id?: string
          nationality?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      v2_events: {
        Row: {
          circuit_id: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          name: string
          round_number: number | null
          season_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["event_status_enum"]
          updated_at: string
        }
        Insert: {
          circuit_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          round_number?: number | null
          season_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["event_status_enum"]
          updated_at?: string
        }
        Update: {
          circuit_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          round_number?: number | null
          season_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["event_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_events_circuit_id_fkey"
            columns: ["circuit_id"]
            isOneToOne: false
            referencedRelation: "v2_circuits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_events_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "v2_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_fastest_laps: {
        Row: {
          created_at: string
          driver_id: string | null
          id: string
          lap_number: number | null
          lap_time: string | null
          position: number | null
          session_id: string
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          id?: string
          lap_number?: number | null
          lap_time?: string | null
          position?: number | null
          session_id: string
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          id?: string
          lap_number?: number | null
          lap_time?: string | null
          position?: number | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_fastest_laps_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v2_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_fastest_laps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v2_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_incidents: {
        Row: {
          created_at: string
          description: string | null
          driver_ids: string[] | null
          id: string
          lap_number: number | null
          outcome: string | null
          penalty_type: string | null
          session_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          driver_ids?: string[] | null
          id?: string
          lap_number?: number | null
          outcome?: string | null
          penalty_type?: string | null
          session_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          driver_ids?: string[] | null
          id?: string
          lap_number?: number | null
          outcome?: string | null
          penalty_type?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_incidents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v2_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_pit_stops: {
        Row: {
          created_at: string
          driver_id: string | null
          id: string
          lap_number: number | null
          session_id: string
          stop_duration: string | null
          total_pit_time: string | null
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          id?: string
          lap_number?: number | null
          session_id: string
          stop_duration?: string | null
          total_pit_time?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          id?: string
          lap_number?: number | null
          session_id?: string
          stop_duration?: string | null
          total_pit_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "v2_pit_stops_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v2_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_pit_stops_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v2_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_practice_results: {
        Row: {
          best_lap_time: string | null
          car_id: string | null
          car_number: string | null
          created_at: string
          driver_id: string | null
          extra_data: Json | null
          gap_to_p1: string | null
          id: string
          laps_run: number | null
          position: number | null
          session_id: string
          team_id: string | null
        }
        Insert: {
          best_lap_time?: string | null
          car_id?: string | null
          car_number?: string | null
          created_at?: string
          driver_id?: string | null
          extra_data?: Json | null
          gap_to_p1?: string | null
          id?: string
          laps_run?: number | null
          position?: number | null
          session_id: string
          team_id?: string | null
        }
        Update: {
          best_lap_time?: string | null
          car_id?: string | null
          car_number?: string | null
          created_at?: string
          driver_id?: string | null
          extra_data?: Json | null
          gap_to_p1?: string | null
          id?: string
          laps_run?: number | null
          position?: number | null
          session_id?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "v2_practice_results_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "v2_cars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_practice_results_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v2_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_practice_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v2_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_practice_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v2_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_qualifying_results: {
        Row: {
          best_time: string | null
          car_id: string | null
          car_number: string | null
          created_at: string
          driver_id: string | null
          extra_data: Json | null
          gap_to_pole: string | null
          id: string
          laps_run: number | null
          position: number | null
          q1_time: string | null
          q2_time: string | null
          q3_time: string | null
          session_id: string
          team_id: string | null
        }
        Insert: {
          best_time?: string | null
          car_id?: string | null
          car_number?: string | null
          created_at?: string
          driver_id?: string | null
          extra_data?: Json | null
          gap_to_pole?: string | null
          id?: string
          laps_run?: number | null
          position?: number | null
          q1_time?: string | null
          q2_time?: string | null
          q3_time?: string | null
          session_id: string
          team_id?: string | null
        }
        Update: {
          best_time?: string | null
          car_id?: string | null
          car_number?: string | null
          created_at?: string
          driver_id?: string | null
          extra_data?: Json | null
          gap_to_pole?: string | null
          id?: string
          laps_run?: number | null
          position?: number | null
          q1_time?: string | null
          q2_time?: string | null
          q3_time?: string | null
          session_id?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "v2_qualifying_results_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "v2_cars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_qualifying_results_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v2_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_qualifying_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v2_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_qualifying_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v2_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_race_results: {
        Row: {
          average_lap_time: string | null
          car_id: string | null
          car_number: string | null
          created_at: string
          dnf_reason: string | null
          driver_id: string | null
          extra_data: Json | null
          fastest_lap_time: string | null
          gap_to_leader: string | null
          id: string
          laps_completed: number | null
          pit_stops: number | null
          points: number | null
          position: number | null
          session_id: string
          status: Database["public"]["Enums"]["result_status_enum"] | null
          team_id: string | null
          total_time: string | null
        }
        Insert: {
          average_lap_time?: string | null
          car_id?: string | null
          car_number?: string | null
          created_at?: string
          dnf_reason?: string | null
          driver_id?: string | null
          extra_data?: Json | null
          fastest_lap_time?: string | null
          gap_to_leader?: string | null
          id?: string
          laps_completed?: number | null
          pit_stops?: number | null
          points?: number | null
          position?: number | null
          session_id: string
          status?: Database["public"]["Enums"]["result_status_enum"] | null
          team_id?: string | null
          total_time?: string | null
        }
        Update: {
          average_lap_time?: string | null
          car_id?: string | null
          car_number?: string | null
          created_at?: string
          dnf_reason?: string | null
          driver_id?: string | null
          extra_data?: Json | null
          fastest_lap_time?: string | null
          gap_to_leader?: string | null
          id?: string
          laps_completed?: number | null
          pit_stops?: number | null
          points?: number | null
          position?: number | null
          session_id?: string
          status?: Database["public"]["Enums"]["result_status_enum"] | null
          team_id?: string | null
          total_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "v2_race_results_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "v2_cars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_race_results_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v2_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_race_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v2_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "v2_race_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v2_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_seasons: {
        Row: {
          created_at: string
          id: string
          series_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          series_id: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          series_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "v2_seasons_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "v2_series"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_series: {
        Row: {
          created_at: string
          id: string
          name: string
          short_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          short_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      v2_sessions: {
        Row: {
          created_at: string
          date: string | null
          event_id: string
          id: string
          name: string
          session_type: Database["public"]["Enums"]["session_type_enum"]
          source_document_url: string | null
          status: Database["public"]["Enums"]["event_status_enum"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string | null
          event_id: string
          id?: string
          name: string
          session_type: Database["public"]["Enums"]["session_type_enum"]
          source_document_url?: string | null
          status?: Database["public"]["Enums"]["event_status_enum"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string | null
          event_id?: string
          id?: string
          name?: string
          session_type?: Database["public"]["Enums"]["session_type_enum"]
          source_document_url?: string | null
          status?: Database["public"]["Enums"]["event_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "v2_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "v2_events"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_teams: {
        Row: {
          created_at: string
          full_name: string
          id: string
          nationality: string | null
          short_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          nationality?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          nationality?: string | null
          short_name?: string | null
          updated_at?: string
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "driver" | "team_sponsor" | "admin"
      claim_status: "pending" | "approved" | "rejected"
      event_status_enum: "draft" | "published"
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
      result_status_enum: "finished" | "dnf" | "dns" | "dsq" | "classified"
      session_type_enum:
        | "practice"
        | "qualifying"
        | "sprint_qualifying"
        | "sprint_race"
        | "race"
        | "warmup"
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
      event_status_enum: ["draft", "published"],
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
      result_status_enum: ["finished", "dnf", "dns", "dsq", "classified"],
      session_type_enum: [
        "practice",
        "qualifying",
        "sprint_qualifying",
        "sprint_race",
        "race",
        "warmup",
        "other",
      ],
      verification_status: ["pending", "verified", "rejected"],
    },
  },
} as const
