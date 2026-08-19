/**
 * Hand-written Database types mirroring supabase/migrations/0001_init.sql.
 * Regenerate/replace with `supabase gen types typescript` once the
 * Supabase CLI is linked in CI — until then, keep this in sync by hand
 * whenever a migration changes the schema.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type QuestStatus =
  | "available"
  | "accepted"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "completed"
  | "failed"
  // Roadmap item 3 — ran out of the 24h "today" window unclaimed/
  // unfinished. Never a penalty (distinct from "failed"); replaced by
  // a fresh quest — see lib/quests/today.ts.
  | "expired";

export type QuestAttemptStatus = "in_progress" | "submitted" | "completed" | "failed";
export type EvidenceType = "text" | "image" | "file" | "url";
export type GoalStatus = "active" | "completed" | "abandoned";
export type XPSourceType = "quest_evaluation" | "achievement" | "adjustment";
export type PermissionState = "unknown" | "granted" | "denied" | "unsupported";
export type AIMessageRole = "user" | "assistant";

interface Table<Row, Insert, Update = Partial<Insert>> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export interface Database {
  public: {
    Views: Record<string, never>;
    Tables: {
      profiles: Table<
        {
          id: string;
          name: string | null;
          avatar_url: string | null;
          preferred_language: string;
          occupation: string | null;
          primary_objective: string | null;
          level: number;
          xp: number;
          current_goal_id: string | null;
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
          preferred_quest_time: string | null;
          starter_quest_completed_at: string | null;
        },
        {
          id: string;
          name?: string | null;
          avatar_url?: string | null;
          preferred_language?: string;
          occupation?: string | null;
          primary_objective?: string | null;
          level?: number;
          xp?: number;
          current_goal_id?: string | null;
          onboarding_completed_at?: string | null;
          preferred_quest_time?: string | null;
          starter_quest_completed_at?: string | null;
        }
      >;
      goals: Table<
        {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          target_value: string | null;
          target_days: number | null;
          status: GoalStatus;
          ai_plan: Json | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          target_value?: string | null;
          target_days?: number | null;
          status?: GoalStatus;
          ai_plan?: Json | null;
        }
      >;
      skills: Table<
        {
          id: string;
          key: string;
          name: string;
          description: string | null;
          category: string;
          icon: string | null;
          requirements: Json;
          sort_order: number;
          created_at: string;
        },
        {
          id?: string;
          key: string;
          name: string;
          description?: string | null;
          category?: string;
          icon?: string | null;
          requirements?: Json;
          sort_order?: number;
        }
      >;
      user_skills: Table<
        {
          id: string;
          user_id: string;
          skill_id: string;
          xp: number;
          mastery_level: number;
          unlocked_at: string | null;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          skill_id: string;
          xp?: number;
          mastery_level?: number;
          unlocked_at?: string | null;
        }
      >;
      quests: Table<
        {
          id: string;
          user_id: string;
          goal_id: string | null;
          skill_id: string | null;
          title: string;
          description: string;
          objective: string;
          difficulty: number;
          estimated_minutes: number;
          xp_reward: number;
          evidence_required: boolean;
          evidence_type: EvidenceType | null;
          success_criteria: Json;
          instructions: Json;
          status: QuestStatus;
          ai_raw_response: Json | null;
          expires_at: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          goal_id?: string | null;
          skill_id?: string | null;
          title: string;
          description: string;
          objective: string;
          difficulty?: number;
          estimated_minutes?: number;
          xp_reward?: number;
          evidence_required?: boolean;
          evidence_type?: EvidenceType | null;
          success_criteria?: Json;
          instructions?: Json;
          status?: QuestStatus;
          ai_raw_response?: Json | null;
          expires_at?: string;
        }
      >;
      quest_attempts: Table<
        {
          id: string;
          quest_id: string;
          user_id: string;
          status: QuestAttemptStatus;
          started_at: string;
          submitted_at: string | null;
          completed_at: string | null;
        },
        {
          id?: string;
          quest_id: string;
          user_id: string;
          status?: QuestAttemptStatus;
          submitted_at?: string | null;
          completed_at?: string | null;
        }
      >;
      quest_evidence: Table<
        {
          id: string;
          quest_attempt_id: string;
          user_id: string;
          evidence_type: EvidenceType;
          storage_path: string | null;
          content: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          created_at: string;
        },
        {
          id?: string;
          quest_attempt_id: string;
          user_id: string;
          evidence_type: EvidenceType;
          storage_path?: string | null;
          content?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
        }
      >;
      xp_transactions: Table<
        {
          id: string;
          user_id: string;
          amount: number;
          source_type: XPSourceType;
          source_id: string | null;
          skill_id: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          amount: number;
          source_type: XPSourceType;
          source_id?: string | null;
          skill_id?: string | null;
        }
      >;
      levels: Table<
        { level_number: number; xp_required: number; title: string | null },
        { level_number: number; xp_required: number; title?: string | null }
      >;
      achievements: Table<
        {
          id: string;
          key: string;
          name: string;
          description: string | null;
          icon: string | null;
          criteria: Json;
          created_at: string;
        },
        {
          id?: string;
          key: string;
          name: string;
          description?: string | null;
          icon?: string | null;
          criteria?: Json;
        }
      >;
      user_achievements: Table<
        { id: string; user_id: string; achievement_id: string; unlocked_at: string },
        { id?: string; user_id: string; achievement_id: string; unlocked_at?: string }
      >;
      streaks: Table<
        {
          user_id: string;
          current_streak: number;
          longest_streak: number;
          last_activity_date: string | null;
          updated_at: string;
          freezes_available: number;
          last_streak_before_break: number | null;
          streak_break_expires_at: string | null;
          earnback_redemptions: number;
        },
        {
          user_id: string;
          current_streak?: number;
          longest_streak?: number;
          last_activity_date?: string | null;
          freezes_available?: number;
          last_streak_before_break?: number | null;
          streak_break_expires_at?: string | null;
          earnback_redemptions?: number;
        }
      >;
      ai_evaluations: Table<
        {
          id: string;
          quest_attempt_id: string;
          user_id: string;
          passed: boolean;
          score: number;
          feedback: string | null;
          strengths: Json;
          improvements: Json;
          xp_awarded: number;
          skill_xp_awarded: number;
          next_action: string | null;
          raw_response: Json | null;
          created_at: string;
        },
        {
          id?: string;
          quest_attempt_id: string;
          user_id: string;
          passed: boolean;
          score: number;
          feedback?: string | null;
          strengths?: Json;
          improvements?: Json;
          xp_awarded?: number;
          skill_xp_awarded?: number;
          next_action?: string | null;
          raw_response?: Json | null;
        }
      >;
      ai_messages: Table<
        {
          id: string;
          user_id: string;
          role: AIMessageRole;
          content: string;
          context: Json | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          role: AIMessageRole;
          content: string;
          context?: Json | null;
        }
      >;
      device_permissions: Table<
        {
          user_id: string;
          camera: PermissionState;
          microphone: PermissionState;
          motion: PermissionState;
          location: PermissionState;
          notifications: PermissionState;
          updated_at: string;
        },
        {
          user_id: string;
          camera?: PermissionState;
          microphone?: PermissionState;
          motion?: PermissionState;
          location?: PermissionState;
          notifications?: PermissionState;
        }
      >;
      app_settings: Table<
        {
          user_id: string;
          sound_enabled: boolean;
          reduced_motion_override: boolean | null;
          settings: Json;
          updated_at: string;
        },
        {
          user_id: string;
          sound_enabled?: boolean;
          reduced_motion_override?: boolean | null;
          settings?: Json;
        }
      >;
      events: Table<
        {
          id: string;
          user_id: string | null;
          name: string;
          props: Json;
          created_at: string;
        },
        {
          user_id: string;
          name: string;
          props?: Json;
        }
      >;
      quest_template_cache: Table<
        {
          id: string;
          category: string;
          difficulty: number;
          day_index: number;
          template: Json;
          created_at: string;
        },
        {
          category: string;
          difficulty: number;
          day_index: number;
          template: Json;
        }
      >;
      mentor_faq_cache: Table<
        {
          id: string;
          normalized_question: string;
          answer: string;
          hit_count: number;
          created_at: string;
          updated_at: string;
        },
        {
          normalized_question: string;
          answer: string;
          hit_count?: number;
          updated_at?: string;
        }
      >;
    };
    Functions: {
      admin_retention_cohorts: {
        Args: Record<string, never>;
        Returns: {
          cohort_date: string;
          cohort_size: number;
          d1_retained: number;
          d7_retained: number;
          d30_retained: number;
        }[];
      };
      admin_streak_distribution: {
        Args: Record<string, never>;
        Returns: { streak_bucket: string; sort_order: number; user_count: number }[];
      };
    };
  };
}
