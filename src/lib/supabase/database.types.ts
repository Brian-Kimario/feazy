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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          access_notes: string | null
          address_line_1: string
          address_line_2: string | null
          area: string | null
          city: string
          created_at: string | null
          customer_id: string
          id: string
          label: string
          latitude: number | null
          longitude: number | null
          postal_code: string | null
          state_region: string | null
          updated_at: string | null
        }
        Insert: {
          access_notes?: string | null
          address_line_1: string
          address_line_2?: string | null
          area?: string | null
          city: string
          created_at?: string | null
          customer_id: string
          id?: string
          label: string
          latitude?: number | null
          longitude?: number | null
          postal_code?: string | null
          state_region?: string | null
          updated_at?: string | null
        }
        Update: {
          access_notes?: string | null
          address_line_1?: string
          address_line_2?: string | null
          area?: string | null
          city?: string
          created_at?: string | null
          customer_id?: string
          id?: string
          label?: string
          latitude?: number | null
          longitude?: number | null
          postal_code?: string | null
          state_region?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_job_cancellations: {
        Row: {
          booking_id: string
          cancelled_by: string
          created_at: string
          customer_reason_category: string
          from_state: string
          id: string
          internal_reason: string
          job_id: string
          paid_payment_count: number
          payment_review_required: boolean
          pending_payment_count: number
        }
        Insert: {
          booking_id: string
          cancelled_by: string
          created_at?: string
          customer_reason_category: string
          from_state: string
          id?: string
          internal_reason: string
          job_id: string
          paid_payment_count?: number
          payment_review_required: boolean
          pending_payment_count?: number
        }
        Update: {
          booking_id?: string
          cancelled_by?: string
          created_at?: string
          customer_reason_category?: string
          from_state?: string
          id?: string
          internal_reason?: string
          job_id?: string
          paid_payment_count?: number
          payment_review_required?: boolean
          pending_payment_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "admin_job_cancellations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_job_cancellations_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_job_cancellations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_reconciliations: {
        Row: {
          booking_id: string
          booking_status_at_time: string
          created_at: string
          had_outstanding_offer: boolean
          id: string
          internal_reason: string
          job_id: string
          job_state_before: string
          kind: string
          performed_by: string
        }
        Insert: {
          booking_id: string
          booking_status_at_time: string
          created_at?: string
          had_outstanding_offer: boolean
          id?: string
          internal_reason: string
          job_id: string
          job_state_before: string
          kind: string
          performed_by: string
        }
        Update: {
          booking_id?: string
          booking_status_at_time?: string
          created_at?: string
          had_outstanding_offer?: boolean
          id?: string
          internal_reason?: string
          job_id?: string
          job_state_before?: string
          kind?: string
          performed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_reconciliations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_reconciliations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_reconciliations_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          created_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      booking_assignment_attempts: {
        Row: {
          booking_id: string
          created_at: string
          decision_id: string | null
          id: string
          outcome: string
          professional_id: string
          reason: string | null
          reason_code: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          decision_id?: string | null
          id?: string
          outcome: string
          professional_id: string
          reason?: string | null
          reason_code?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          decision_id?: string | null
          id?: string
          outcome?: string
          professional_id?: string
          reason?: string | null
          reason_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_assignment_attempts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_assignment_attempts_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "matching_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_assignment_attempts_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_metrics"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "booking_assignment_attempts_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_reference: string
          booking_status: string
          created_at: string | null
          customer_id: string
          id: string
          intake_options: Json
          pricing_model: string
          problem_summary: string | null
          professional_id: string | null
          property_id: string
          quoted_or_base_amount: number | null
          scheduled_end: string | null
          scheduled_start: string
          service_id: string
          service_request_id: string | null
          unmatched_since: string | null
          updated_at: string | null
          urgency: string
        }
        Insert: {
          booking_reference?: string
          booking_status?: string
          created_at?: string | null
          customer_id: string
          id?: string
          intake_options?: Json
          pricing_model: string
          problem_summary?: string | null
          professional_id?: string | null
          property_id: string
          quoted_or_base_amount?: number | null
          scheduled_end?: string | null
          scheduled_start: string
          service_id: string
          service_request_id?: string | null
          unmatched_since?: string | null
          updated_at?: string | null
          urgency?: string
        }
        Update: {
          booking_reference?: string
          booking_status?: string
          created_at?: string | null
          customer_id?: string
          id?: string
          intake_options?: Json
          pricing_model?: string
          problem_summary?: string | null
          professional_id?: string | null
          property_id?: string
          quoted_or_base_amount?: number | null
          scheduled_end?: string | null
          scheduled_start?: string
          service_id?: string
          service_request_id?: string | null
          unmatched_since?: string | null
          updated_at?: string | null
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_metrics"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "bookings_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          booking_ref: string | null
          created_at: string
          email: string
          id: string
          message: string
          name: string
          reference: string | null
          status: string
          topic: string
          user_id: string | null
        }
        Insert: {
          booking_ref?: string | null
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          reference?: string | null
          status?: string
          topic: string
          user_id?: string | null
        }
        Update: {
          booking_ref?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          reference?: string | null
          status?: string
          topic?: string
          user_id?: string | null
        }
        Relationships: []
      }
      inspections: {
        Row: {
          created_at: string | null
          findings: string
          id: string
          job_id: string
          professional_id: string
          recommendation: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          findings: string
          id?: string
          job_id: string
          professional_id: string
          recommendation?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          findings?: string
          id?: string
          job_id?: string
          professional_id?: string
          recommendation?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspections_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_metrics"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "inspections_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      job_code_attempts: {
        Row: {
          actor_user_id: string | null
          code_id: string
          created_at: string
          id: string
          job_id: string
          purpose: string
          succeeded: boolean
        }
        Insert: {
          actor_user_id?: string | null
          code_id: string
          created_at?: string
          id?: string
          job_id: string
          purpose: string
          succeeded: boolean
        }
        Update: {
          actor_user_id?: string | null
          code_id?: string
          created_at?: string
          id?: string
          job_id?: string
          purpose?: string
          succeeded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "job_code_attempts_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_code_attempts_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "job_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_code_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_code_secrets: {
        Row: {
          id: number
          pepper: string
        }
        Insert: {
          id: number
          pepper: string
        }
        Update: {
          id?: number
          pepper?: string
        }
        Relationships: []
      }
      job_codes: {
        Row: {
          expires_at: string
          id: string
          is_reissue: boolean
          issued_at: string
          job_id: string
          locked_at: string | null
          nonce: string
          purpose: string
          status: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          expires_at: string
          id?: string
          is_reissue?: boolean
          issued_at?: string
          job_id: string
          locked_at?: string | null
          nonce: string
          purpose: string
          status?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          expires_at?: string
          id?: string
          is_reissue?: boolean
          issued_at?: string
          job_id?: string
          locked_at?: string | null
          nonce?: string
          purpose?: string
          status?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_codes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_codes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_events: {
        Row: {
          actor_user_id: string
          created_at: string | null
          event_type: string
          from_state: string
          id: string
          job_id: string
          metadata: Json | null
          to_state: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string | null
          event_type: string
          from_state: string
          id?: string
          job_id: string
          metadata?: Json | null
          to_state: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string | null
          event_type?: string
          from_state?: string
          id?: string
          job_id?: string
          metadata?: Json | null
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_exceptions: {
        Row: {
          id: string
          job_id: string
          kind: string
          preference: string
          professional_id: string | null
          reported_at: string
          reported_by: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          scheduled_start: string
          status: string
        }
        Insert: {
          id?: string
          job_id: string
          kind: string
          preference: string
          professional_id?: string | null
          reported_at?: string
          reported_by: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scheduled_start: string
          status?: string
        }
        Update: {
          id?: string
          job_id?: string
          kind?: string
          preference?: string
          professional_id?: string | null
          reported_at?: string
          reported_by?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scheduled_start?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_exceptions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_exceptions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_exceptions_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_exceptions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_media: {
        Row: {
          created_at: string
          id: string
          job_id: string
          kind: string
          storage_path: string
          uploader_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          kind: string
          storage_path: string
          uploader_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          kind?: string
          storage_path?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_media_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_media_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_message_reads: {
        Row: {
          job_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          job_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          job_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_message_reads_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_messages: {
        Row: {
          body: string
          client_key: string
          created_at: string
          id: string
          job_id: string
          professional_id: string
          sender_id: string
        }
        Insert: {
          body: string
          client_key: string
          created_at?: string
          id?: string
          job_id: string
          professional_id: string
          sender_id: string
        }
        Update: {
          body?: string
          client_key?: string
          created_at?: string
          id?: string
          job_id?: string
          professional_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_metrics"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "job_messages_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "job_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          accepted_at: string | null
          arrived_at: string | null
          booking_id: string
          cancelled_at: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string | null
          current_state: string
          customer_id: string
          eta_earliest: string | null
          eta_latest: string | null
          id: string
          offer_expires_at: string | null
          on_the_way_at: string | null
          professional_id: string | null
          property_id: string
          started_at: string | null
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          arrived_at?: string | null
          booking_id: string
          cancelled_at?: string | null
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_state?: string
          customer_id: string
          eta_earliest?: string | null
          eta_latest?: string | null
          id?: string
          offer_expires_at?: string | null
          on_the_way_at?: string | null
          professional_id?: string | null
          property_id: string
          started_at?: string | null
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          arrived_at?: string | null
          booking_id?: string
          cancelled_at?: string | null
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_state?: string
          customer_id?: string
          eta_earliest?: string | null
          eta_latest?: string | null
          id?: string
          offer_expires_at?: string | null
          on_the_way_at?: string | null
          professional_id?: string | null
          property_id?: string
          started_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_metrics"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "jobs_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      matching_config: {
        Row: {
          description: string
          key: string
          updated_at: string
          value: number
        }
        Insert: {
          description: string
          key: string
          updated_at?: string
          value: number
        }
        Update: {
          description?: string
          key?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      matching_decisions: {
        Row: {
          booking_id: string
          created_at: string
          distance_km: number | null
          geo_basis: string | null
          id: string
          inputs: Json
          job_id: string | null
          kind: string
          pool_size: number
          professional_id: string | null
          score: number | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          distance_km?: number | null
          geo_basis?: string | null
          id?: string
          inputs?: Json
          job_id?: string | null
          kind: string
          pool_size: number
          professional_id?: string | null
          score?: number | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          distance_km?: number | null
          geo_basis?: string | null
          id?: string
          inputs?: Json
          job_id?: string | null
          kind?: string
          pool_size?: number
          professional_id?: string | null
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "matching_decisions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matching_decisions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matching_decisions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_metrics"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "matching_decisions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      materials: {
        Row: {
          brand_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          specification: string | null
          unit: string
          updated_at: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          specification?: string | null
          unit: string
          updated_at?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          specification?: string | null
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: number
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: number
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      notification_failures: {
        Row: {
          attempts: number
          created_at: string
          error_code: string
          id: string
          last_attempt_at: string
          resolved_at: string | null
          source_id: string
          source_type: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_code: string
          id?: string
          last_attempt_at?: string
          resolved_at?: string | null
          source_id: string
          source_type: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_code?: string
          id?: string
          last_attempt_at?: string
          resolved_at?: string | null
          source_id?: string
          source_type?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          channel_attempted: string | null
          created_at: string | null
          customer_id: string
          id: string
          job_id: string | null
          notification_type: string
          sent_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          channel_attempted?: string | null
          created_at?: string | null
          customer_id: string
          id?: string
          job_id?: string | null
          notification_type: string
          sent_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          channel_attempted?: string | null
          created_at?: string | null
          customer_id?: string
          id?: string
          job_id?: string | null
          notification_type?: string
          sent_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          job_id: string
          kind: string
          link: string
          read_at: string | null
          source_id: string
          source_type: string
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          job_id: string
          kind: string
          link: string
          read_at?: string | null
          source_id: string
          source_type: string
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          job_id?: string
          kind?: string
          link?: string
          read_at?: string | null
          source_id?: string
          source_type?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          from_status: string
          id: string
          metadata: Json
          payment_id: string
          provider_event: string
          provider_payment_id: string | null
          to_status: string
        }
        Insert: {
          created_at?: string
          from_status: string
          id?: string
          metadata?: Json
          payment_id: string
          provider_event: string
          provider_payment_id?: string | null
          to_status: string
        }
        Update: {
          created_at?: string
          from_status?: string
          id?: string
          metadata?: Json
          payment_id?: string
          provider_event?: string
          provider_payment_id?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string | null
          currency: string
          customer_id: string
          id: string
          job_id: string | null
          paid_at: string | null
          payment_type: string
          provider: string
          provider_reference: string
          quote_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string | null
          currency?: string
          customer_id: string
          id?: string
          job_id?: string | null
          paid_at?: string | null
          payment_type: string
          provider: string
          provider_reference: string
          quote_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string | null
          currency?: string
          customer_id?: string
          id?: string
          job_id?: string | null
          paid_at?: string | null
          payment_type?: string
          provider?: string
          provider_reference?: string
          quote_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_availability: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean | null
          professional_id: string
          start_time: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean | null
          professional_id: string
          start_time: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean | null
          professional_id?: string
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_availability_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_metrics"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "professional_availability_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      professional_profiles: {
        Row: {
          bio: string | null
          completed_jobs_count: number | null
          created_at: string | null
          display_name: string
          is_available: boolean | null
          rating_average: number | null
          updated_at: string | null
          user_id: string
          verification_status: string
          years_experience: number | null
        }
        Insert: {
          bio?: string | null
          completed_jobs_count?: number | null
          created_at?: string | null
          display_name: string
          is_available?: boolean | null
          rating_average?: number | null
          updated_at?: string | null
          user_id: string
          verification_status?: string
          years_experience?: number | null
        }
        Update: {
          bio?: string | null
          completed_jobs_count?: number | null
          created_at?: string | null
          display_name?: string
          is_available?: boolean | null
          rating_average?: number | null
          updated_at?: string | null
          user_id?: string
          verification_status?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_service_areas: {
        Row: {
          area: string | null
          base_lat: number | null
          base_lng: number | null
          city: string
          created_at: string | null
          id: string
          is_active: boolean | null
          professional_id: string
          radius_km: number | null
          updated_at: string | null
        }
        Insert: {
          area?: string | null
          base_lat?: number | null
          base_lng?: number | null
          city: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          professional_id: string
          radius_km?: number | null
          updated_at?: string | null
        }
        Update: {
          area?: string | null
          base_lat?: number | null
          base_lng?: number | null
          city?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          professional_id?: string
          radius_km?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_service_areas_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_metrics"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "professional_service_areas_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      professional_skills: {
        Row: {
          created_at: string | null
          id: string
          professional_id: string
          service_category_id: string
          service_id: string | null
          skill_level: string | null
          updated_at: string | null
          verified: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          professional_id: string
          service_category_id: string
          service_id?: string | null
          skill_level?: string | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          professional_id?: string
          service_category_id?: string
          service_id?: string | null
          skill_level?: string | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_skills_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_metrics"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "professional_skills_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "professional_skills_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_skills_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_verification_documents: {
        Row: {
          document_type: string
          id: string
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          status: string | null
          storage_path: string
          uploaded_at: string | null
          verification_id: string
        }
        Insert: {
          document_type: string
          id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: string | null
          storage_path: string
          uploaded_at?: string | null
          verification_id: string
        }
        Update: {
          document_type?: string
          id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: string | null
          storage_path?: string
          uploaded_at?: string | null
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_verification_documents_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_verification_documents_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "professional_verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_verification_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string
          created_at: string
          from_status: string
          id: string
          metadata: Json
          professional_id: string
          reason: string
          to_status: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role: string
          created_at?: string
          from_status: string
          id?: string
          metadata?: Json
          professional_id: string
          reason: string
          to_status: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          from_status?: string
          id?: string
          metadata?: Json
          professional_id?: string
          reason?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_verification_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_verification_events_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_metrics"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "professional_verification_events_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      professional_verifications: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          professional_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          professional_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          professional_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_verifications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_metrics"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "professional_verifications_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "professional_verifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address_id: string
          created_at: string | null
          id: string
          name: string
          notes: string | null
          owner_customer_id: string
          property_type: string
          updated_at: string | null
        }
        Insert: {
          address_id: string
          created_at?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_customer_id: string
          property_type: string
          updated_at?: string | null
        }
        Update: {
          address_id?: string
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_customer_id?: string
          property_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_owner_customer_id_fkey"
            columns: ["owner_customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_assets: {
        Row: {
          brand: string | null
          category: string
          created_at: string | null
          id: string
          installed_at: string | null
          model: string | null
          name: string
          notes: string | null
          property_id: string
          serial_number: string | null
          updated_at: string | null
          warranty_expires_at: string | null
        }
        Insert: {
          brand?: string | null
          category: string
          created_at?: string | null
          id?: string
          installed_at?: string | null
          model?: string | null
          name: string
          notes?: string | null
          property_id: string
          serial_number?: string | null
          updated_at?: string | null
          warranty_expires_at?: string | null
        }
        Update: {
          brand?: string | null
          category?: string
          created_at?: string | null
          id?: string
          installed_at?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          property_id?: string
          serial_number?: string | null
          updated_at?: string | null
          warranty_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_assets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string | null
          description: string
          id: string
          item_type: string
          line_total: number
          material_id: string | null
          quantity: number
          quote_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          item_type: string
          line_total: number
          material_id?: string | null
          quantity: number
          quote_id: string
          unit_price: number
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          item_type?: string
          line_total?: number
          material_id?: string | null
          quantity?: number
          quote_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string | null
          discount: number | null
          expires_at: string | null
          id: string
          job_id: string
          professional_id: string
          reason: string
          status: string
          subtotal: number
          taxes_or_fees: number | null
          total: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          discount?: number | null
          expires_at?: string | null
          id?: string
          job_id: string
          professional_id: string
          reason: string
          status?: string
          subtotal: number
          taxes_or_fees?: number | null
          total: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          discount?: number | null
          expires_at?: string | null
          id?: string
          job_id?: string
          professional_id?: string
          reason?: string
          status?: string
          subtotal?: number
          taxes_or_fees?: number | null
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_metrics"
            referencedColumns: ["professional_id"]
          },
          {
            foreignKeyName: "quotes_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string | null
          description: string | null
          icon_key: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon_key?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon_key?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      service_materials: {
        Row: {
          created_at: string | null
          is_customer_selectable: boolean | null
          is_professional_selectable: boolean | null
          material_id: string
          service_id: string
        }
        Insert: {
          created_at?: string | null
          is_customer_selectable?: boolean | null
          is_professional_selectable?: boolean | null
          material_id: string
          service_id: string
        }
        Update: {
          created_at?: string | null
          is_customer_selectable?: boolean | null
          is_professional_selectable?: boolean | null
          material_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_materials_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_option_values: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          label: string
          price_modifier: number | null
          service_option_id: string
          sort_order: number | null
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          price_modifier?: number | null
          service_option_id: string
          sort_order?: number | null
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          price_modifier?: number | null
          service_option_id?: string
          sort_order?: number | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_option_values_service_option_id_fkey"
            columns: ["service_option_id"]
            isOneToOne: false
            referencedRelation: "service_options"
            referencedColumns: ["id"]
          },
        ]
      }
      service_options: {
        Row: {
          created_at: string | null
          id: string
          is_required: boolean | null
          name: string
          option_type: string
          service_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          name: string
          option_type: string
          service_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          name?: string
          option_type?: string
          service_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_options_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          classification_confidence: string | null
          created_at: string | null
          customer_id: string
          id: string
          input_text: string | null
          intake_source: string | null
          normalized_summary: string | null
          property_id: string
          status: string | null
          suggested_category_id: string | null
          suggested_service_id: string | null
          updated_at: string | null
        }
        Insert: {
          classification_confidence?: string | null
          created_at?: string | null
          customer_id: string
          id?: string
          input_text?: string | null
          intake_source?: string | null
          normalized_summary?: string | null
          property_id: string
          status?: string | null
          suggested_category_id?: string | null
          suggested_service_id?: string | null
          updated_at?: string | null
        }
        Update: {
          classification_confidence?: string | null
          created_at?: string | null
          customer_id?: string
          id?: string
          input_text?: string | null
          intake_source?: string | null
          normalized_summary?: string | null
          property_id?: string
          status?: string | null
          suggested_category_id?: string | null
          suggested_service_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_suggested_category_id_fkey"
            columns: ["suggested_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_suggested_service_id_fkey"
            columns: ["suggested_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          base_price: number | null
          category_id: string
          created_at: string | null
          description: string | null
          estimated_duration_minutes: number | null
          id: string
          inspection_fee: number | null
          is_active: boolean | null
          name: string
          pricing_model: string
          requires_inspection: boolean | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          base_price?: number | null
          category_id: string
          created_at?: string | null
          description?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          inspection_fee?: number | null
          is_active?: boolean | null
          name: string
          pricing_model: string
          requires_inspection?: boolean | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          base_price?: number | null
          category_id?: string
          created_at?: string | null
          description?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          inspection_fee?: number | null
          is_active?: boolean | null
          name?: string
          pricing_model?: string
          requires_inspection?: boolean | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      professional_metrics: {
        Row: {
          acceptance_rate: number | null
          cancel_rate: number | null
          completion_rate: number | null
          jobs_completed: number | null
          median_response_seconds: number | null
          offers_accepted: number | null
          offers_declined: number | null
          offers_expired: number | null
          professional_id: string | null
          rating_average: number | null
          rating_count: number | null
          repeat_customer_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_profiles_user_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _assign_booking_internal: {
        Args: { p_actor: string; p_booking_id: string }
        Returns: string
      }
      _haversine_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      _issue_job_code: {
        Args: {
          p_actor: string
          p_job_id: string
          p_purpose: string
          p_reissue: boolean
        }
        Returns: string
      }
      _job_code_event: {
        Args: {
          p_actor: string
          p_job_id: string
          p_metadata: Json
          p_type: string
        }
        Returns: undefined
      }
      _job_code_purpose: { Args: { p_state: string }; Returns: string }
      _job_code_value: { Args: { p_code_id: string }; Returns: string }
      _job_payment_amount: {
        Args: { p_customer: string; p_job_id: string }
        Returns: Record<string, unknown>
      }
      _matching_setting: { Args: { p_key: string }; Returns: number }
      _notify: {
        Args: {
          p_body?: string
          p_job: Database["public"]["Tables"]["jobs"]["Row"]
          p_kind: string
          p_source_id: string
          p_source_type: string
          p_user: string
        }
        Returns: undefined
      }
      _notify_for_event: { Args: { p_event_id: string }; Returns: undefined }
      _notify_for_message: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      _offer_next: {
        Args: { p_actor: string; p_booking_id: string }
        Returns: string
      }
      _pick_professional: { Args: { p_booking_id: string }; Returns: string }
      _rank_professionals: {
        Args: { p_booking_id: string }
        Returns: {
          distance_km: number
          geo_basis: string
          inputs: Json
          professional_id: string
          score: number
        }[]
      }
      _record_notification_failure: {
        Args: {
          p_error_code: string
          p_source_id: string
          p_source_type: string
        }
        Returns: undefined
      }
      _release_offer: {
        Args: {
          p_actor: string
          p_job_id: string
          p_note: string
          p_outcome: string
          p_reason_code: string
        }
        Returns: boolean
      }
      _verification_missing_documents: {
        Args: { p_professional_id: string; p_since?: string }
        Returns: string[]
      }
      add_job_media: {
        Args: { p_job_id: string; p_kind: string; p_storage_path: string }
        Returns: string
      }
      admin_cancel_job: {
        Args: {
          p_customer_reason_category: string
          p_expected_state: string
          p_job_id: string
          p_reason: string
        }
        Returns: Json
      }
      admin_reconcile_job: {
        Args: { p_expected_state: string; p_job_id: string; p_reason: string }
        Returns: Json
      }
      admin_transition_professional_verification: {
        Args: {
          p_action: string
          p_expected_status: string
          p_metadata?: Json
          p_professional_id: string
          p_reason: string
        }
        Returns: Json
      }
      assign_booking: { Args: { p_booking_id: string }; Returns: Json }
      create_booking: {
        Args: {
          p_options?: Json
          p_problem_summary?: string
          p_property_id: string
          p_scheduled_start: string
          p_service_id: string
          p_urgency?: string
        }
        Returns: {
          booking_id: string
          booking_reference: string
        }[]
      }
      create_pending_payment: {
        Args: {
          p_amount_paise: number
          p_job_id: string
          p_provider_reference: string
        }
        Returns: string
      }
      create_quote: {
        Args: { p_items: Json; p_job_id: string; p_reason: string }
        Returns: string
      }
      decline_job: {
        Args: { p_job_id: string; p_note?: string; p_reason_code: string }
        Returns: Json
      }
      get_assignment_queue_status: { Args: never; Returns: Json }
      get_booking_professional: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      get_job_code_state: { Args: { p_job_id: string }; Returns: Json }
      get_job_customer_contact: {
        Args: { p_job_id: string }
        Returns: {
          access_notes: string
          address_line_1: string
          address_line_2: string
          area: string
          city: string
          full_name: string
          phone: string
          postal_code: string
        }[]
      }
      get_message_threads: {
        Args: never
        Returns: {
          job_id: string
          last_body: string
          last_message_at: string
          last_sender_id: string
          unread_count: number
        }[]
      }
      get_offer_localities: {
        Args: { p_job_ids: string[] }
        Returns: {
          area: string
          city: string
          distance_km: number
          job_id: string
        }[]
      }
      job_paid_at: { Args: { p_job_id: string }; Returns: string }
      job_payment_amount: { Args: { p_job_id: string }; Returns: number }
      list_orphan_job_media: {
        Args: { p_older_than?: string }
        Returns: string[]
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_job_thread_read: { Args: { p_job_id: string }; Returns: undefined }
      mark_notification_read: { Args: { p_id: string }; Returns: boolean }
      process_assignment_queue: { Args: never; Returns: Json }
      reconcile_notifications: { Args: never; Returns: number }
      reissue_job_code: { Args: { p_job_id: string }; Returns: Json }
      report_job_eta: {
        Args: {
          p_earliest_minutes: number
          p_job_id: string
          p_latest_minutes: number
          p_running_late?: boolean
        }
        Returns: undefined
      }
      report_professional_no_show: {
        Args: { p_job_id: string; p_preference: string }
        Returns: Json
      }
      request_job_media_sweep: { Args: never; Returns: number }
      resolve_job_exception: {
        Args: { p_exception_id: string; p_note: string; p_status: string }
        Returns: undefined
      }
      respond_to_quote: {
        Args: { p_decision: string; p_quote_id: string; p_reason?: string }
        Returns: boolean
      }
      send_job_message: {
        Args: { p_body: string; p_client_key: string; p_job_id: string }
        Returns: string
      }
      submit_inspection: {
        Args: {
          p_findings: string
          p_job_id: string
          p_recommendation?: string
        }
        Returns: string
      }
      submit_professional_verification: { Args: never; Returns: Json }
      transition_job_state: {
        Args: {
          p_actor_user_id: string
          p_job_id: string
          p_metadata?: Json
          p_new_state: string
        }
        Returns: boolean
      }
      transition_payment_status: {
        Args: {
          p_amount_paise: number
          p_currency: string
          p_metadata?: Json
          p_new_status: string
          p_provider_event: string
          p_provider_payment_id: string
          p_provider_reference: string
        }
        Returns: string
      }
      verify_job_code: {
        Args: { p_code: string; p_job_id: string; p_purpose: string }
        Returns: Json
      }
    }
    Enums: {
      user_role: "customer" | "professional" | "admin" | "support"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      user_role: ["customer", "professional", "admin", "support"],
    },
  },
} as const
