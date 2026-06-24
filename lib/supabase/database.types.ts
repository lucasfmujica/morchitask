export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      channels: {
        Row: {
          archived_at: string | null;
          color: string;
          created_at: string;
          household_id: string;
          icon: string | null;
          id: string;
          name: string;
          owner_id: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          color?: string;
          created_at?: string;
          household_id?: string;
          icon?: string | null;
          id?: string;
          name: string;
          owner_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          color?: string;
          created_at?: string;
          household_id?: string;
          icon?: string | null;
          id?: string;
          name?: string;
          owner_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "channels_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "channels_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_notes: {
        Row: {
          capacity_min: number | null;
          created_at: string;
          end_target_min: number | null;
          household_id: string;
          id: string;
          intention: string | null;
          mood: number | null;
          note_date: string;
          owner_id: string;
          plan_completed_at: string | null;
          reflection: string | null;
          shutdown_completed_at: string | null;
          updated_at: string;
        };
        Insert: {
          capacity_min?: number | null;
          created_at?: string;
          end_target_min?: number | null;
          household_id?: string;
          id?: string;
          intention?: string | null;
          mood?: number | null;
          note_date: string;
          owner_id?: string;
          plan_completed_at?: string | null;
          reflection?: string | null;
          shutdown_completed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          capacity_min?: number | null;
          created_at?: string;
          end_target_min?: number | null;
          household_id?: string;
          id?: string;
          intention?: string | null;
          mood?: number | null;
          note_date?: string;
          owner_id?: string;
          plan_completed_at?: string | null;
          reflection?: string | null;
          shutdown_completed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_notes_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_notes_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      google_credentials: {
        Row: {
          created_at: string;
          owner_id: string;
          refresh_token: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          owner_id: string;
          refresh_token: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          owner_id?: string;
          refresh_token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "google_credentials_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          timezone: string;
          updated_at: string;
          week_starts_on: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name?: string;
          timezone?: string;
          updated_at?: string;
          week_starts_on?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          timezone?: string;
          updated_at?: string;
          week_starts_on?: number;
        };
        Relationships: [];
      };
      objectives: {
        Row: {
          created_at: string;
          end_date: string;
          household_id: string;
          id: string;
          owner_id: string;
          period: string;
          sort_order: number;
          start_date: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          household_id?: string;
          id?: string;
          owner_id?: string;
          period?: string;
          sort_order?: number;
          start_date: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          household_id?: string;
          id?: string;
          owner_id?: string;
          period?: string;
          sort_order?: number;
          start_date?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "objectives_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "objectives_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          capacity_target_min: number | null;
          color: string;
          created_at: string;
          display_name: string;
          gcal_target_calendar_id: string | null;
          google_calendar_connected: boolean;
          household_id: string;
          id: string;
          notification_prefs: Json;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          capacity_target_min?: number | null;
          color?: string;
          created_at?: string;
          display_name?: string;
          gcal_target_calendar_id?: string | null;
          google_calendar_connected?: boolean;
          household_id: string;
          id: string;
          notification_prefs?: Json;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          capacity_target_min?: number | null;
          color?: string;
          created_at?: string;
          display_name?: string;
          gcal_target_calendar_id?: string | null;
          google_calendar_connected?: boolean;
          household_id?: string;
          id?: string;
          notification_prefs?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth_key: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          profile_id: string;
        };
        Insert: {
          auth_key: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          profile_id?: string;
        };
        Update: {
          auth_key?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_templates: {
        Row: {
          active_from: string;
          active_until: string | null;
          channel_id: string | null;
          created_at: string;
          freq: string;
          household_id: string;
          id: string;
          notes: string | null;
          owner_id: string;
          paused: boolean;
          time_estimate_min: number | null;
          title: string;
          updated_at: string;
          weekdays: number[] | null;
        };
        Insert: {
          active_from?: string;
          active_until?: string | null;
          channel_id?: string | null;
          created_at?: string;
          freq?: string;
          household_id?: string;
          id?: string;
          notes?: string | null;
          owner_id?: string;
          paused?: boolean;
          time_estimate_min?: number | null;
          title: string;
          updated_at?: string;
          weekdays?: number[] | null;
        };
        Update: {
          active_from?: string;
          active_until?: string | null;
          channel_id?: string | null;
          created_at?: string;
          freq?: string;
          household_id?: string;
          id?: string;
          notes?: string | null;
          owner_id?: string;
          paused?: boolean;
          time_estimate_min?: number | null;
          title?: string;
          updated_at?: string;
          weekdays?: number[] | null;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_templates_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_templates_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurring_templates_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      subtasks: {
        Row: {
          created_at: string;
          done: boolean;
          household_id: string;
          id: string;
          sort_order: number;
          task_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          done?: boolean;
          household_id?: string;
          id?: string;
          sort_order?: number;
          task_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          done?: boolean;
          household_id?: string;
          id?: string;
          sort_order?: number;
          task_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subtasks_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subtasks_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      task_blocks: {
        Row: {
          created_at: string;
          end_at: string;
          gcal_event_id: string | null;
          gcal_synced_at: string | null;
          household_id: string;
          id: string;
          start_at: string;
          task_id: string;
        };
        Insert: {
          created_at?: string;
          end_at: string;
          gcal_event_id?: string | null;
          gcal_synced_at?: string | null;
          household_id?: string;
          id?: string;
          start_at: string;
          task_id: string;
        };
        Update: {
          created_at?: string;
          end_at?: string;
          gcal_event_id?: string | null;
          gcal_synced_at?: string | null;
          household_id?: string;
          id?: string;
          start_at?: string;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_blocks_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_blocks_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      task_comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          household_id: string;
          id: string;
          task_id: string;
        };
        Insert: {
          author_id?: string;
          body: string;
          created_at?: string;
          household_id?: string;
          id?: string;
          task_id: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          household_id?: string;
          id?: string;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_comments_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_comments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      task_reactions: {
        Row: {
          author_id: string;
          created_at: string;
          emoji: string;
          household_id: string;
          id: string;
          task_id: string;
        };
        Insert: {
          author_id?: string;
          created_at?: string;
          emoji: string;
          household_id?: string;
          id?: string;
          task_id: string;
        };
        Update: {
          author_id?: string;
          created_at?: string;
          emoji?: string;
          household_id?: string;
          id?: string;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_reactions_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_reactions_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_reactions_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          active_since: string | null;
          actual_time_min: number | null;
          block_end: string | null;
          block_start: string | null;
          channel_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          gcal_event_id: string | null;
          gcal_synced_at: string | null;
          household_id: string;
          id: string;
          notes: string | null;
          objective_id: string | null;
          owner_id: string;
          planned_date: string | null;
          remind_at: string | null;
          reminder_sent_at: string | null;
          rollover_count: number;
          rollover_origin_date: string | null;
          shared: boolean;
          sort_order: number;
          status: string;
          template_date: string | null;
          template_id: string | null;
          time_estimate_min: number | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          active_since?: string | null;
          actual_time_min?: number | null;
          block_end?: string | null;
          block_start?: string | null;
          channel_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          gcal_event_id?: string | null;
          gcal_synced_at?: string | null;
          household_id?: string;
          id?: string;
          notes?: string | null;
          objective_id?: string | null;
          owner_id?: string;
          planned_date?: string | null;
          remind_at?: string | null;
          reminder_sent_at?: string | null;
          rollover_count?: number;
          rollover_origin_date?: string | null;
          shared?: boolean;
          sort_order?: number;
          status?: string;
          template_date?: string | null;
          template_id?: string | null;
          time_estimate_min?: number | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          active_since?: string | null;
          actual_time_min?: number | null;
          block_end?: string | null;
          block_start?: string | null;
          channel_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          gcal_event_id?: string | null;
          gcal_synced_at?: string | null;
          household_id?: string;
          id?: string;
          notes?: string | null;
          objective_id?: string | null;
          owner_id?: string;
          planned_date?: string | null;
          remind_at?: string | null;
          reminder_sent_at?: string | null;
          rollover_count?: number;
          rollover_origin_date?: string | null;
          shared?: boolean;
          sort_order?: number;
          status?: string;
          template_date?: string | null;
          template_id?: string | null;
          time_estimate_min?: number | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_objective_id_fkey";
            columns: ["objective_id"];
            isOneToOne: false;
            referencedRelation: "objectives";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "recurring_templates";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      ensure_day_materialized: {
        Args: { target_date: string };
        Returns: undefined;
      };
      rollover_incomplete: {
        Args: { from_date: string; to_date: string };
        Returns: number;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
