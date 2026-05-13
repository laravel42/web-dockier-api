export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type MembershipRole = "admin" | "member";

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          password_hash: string | null;
          name: string;
          app_id: string;
          organization_id: string | null;
          avatar_url: string | null;
          country: string;
          language: string;
          timezone: string;
          role: MembershipRole | null;
          two_factor_enabled: boolean;
          two_factor_secret: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["users"]["Row"]> &
          Pick<Database["public"]["Tables"]["users"]["Row"], "id" | "email" | "app_id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["users"]["Row"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          app_id: string;
          organization_id: string | null;
          name: string;
          repository: string;
          branch: string;
          connection_id: string;
          platform: string;
          source_type: string;
          template: string;
          config: Json;
          created_at: string;
          updated_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["projects"]["Row"]> &
          Pick<
            Database["public"]["Tables"]["projects"]["Row"],
            "id" | "app_id" | "name" | "repository" | "branch" | "created_at"
          >;
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["organizations"]["Row"]> &
          Pick<Database["public"]["Tables"]["organizations"]["Row"], "name" | "slug">;
        Update: Partial<Database["public"]["Tables"]["organizations"]["Row"]>;
        Relationships: [];
      };
      organization_memberships: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: MembershipRole;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["organization_memberships"]["Row"]> &
          Pick<Database["public"]["Tables"]["organization_memberships"]["Row"], "organization_id" | "user_id" | "role">;
        Update: Partial<Database["public"]["Tables"]["organization_memberships"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
