export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type MembershipRole = "admin" | "member";
export type AppRole = "admin" | "moderator" | "user";

export type Database = {
  public: {
    Tables: {
      apps: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
          updated_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["apps"]["Row"]> &
          Pick<Database["public"]["Tables"]["apps"]["Row"], "id" | "name" | "slug">;
        Update: Partial<Database["public"]["Tables"]["apps"]["Row"]>;
        Relationships: [];
      };
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
          role_id: string | null;
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
      social_connections: {
        Row: {
          id: string;
          user_id: string;
          app_id: string;
          provider: string;
          provider_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["social_connections"]["Row"]> &
          Pick<Database["public"]["Tables"]["social_connections"]["Row"], "id" | "user_id" | "provider" | "provider_id">;
        Update: Partial<Database["public"]["Tables"]["social_connections"]["Row"]>;
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
          Pick<Database["public"]["Tables"]["projects"]["Row"], "id" | "app_id" | "name" | "repository" | "branch" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [];
      };
      roles: {
        Row: {
          id: string;
          app_id: string;
          name: string;
          description: string;
          permissions: string[];
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["roles"]["Row"]> &
          Pick<Database["public"]["Tables"]["roles"]["Row"], "id" | "app_id" | "name">;
        Update: Partial<Database["public"]["Tables"]["roles"]["Row"]>;
        Relationships: [];
      };
      git_connections: {
        Row: {
          id: string;
          app_id: string;
          provider: string;
          personal_token: string;
          label: string;
          repo_url: string;
          endpoint: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["git_connections"]["Row"]> &
          Pick<Database["public"]["Tables"]["git_connections"]["Row"], "id" | "app_id" | "provider" | "personal_token">;
        Update: Partial<Database["public"]["Tables"]["git_connections"]["Row"]>;
        Relationships: [];
      };
      analysis_cache: {
        Row: {
          id: string;
          app_id: string;
          project_id: string | null;
          repo: string;
          branch: string;
          commit_sha: string;
          result: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["analysis_cache"]["Row"]> &
          Pick<Database["public"]["Tables"]["analysis_cache"]["Row"], "id" | "repo" | "branch" | "commit_sha" | "result">;
        Update: Partial<Database["public"]["Tables"]["analysis_cache"]["Row"]>;
        Relationships: [];
      };
      stack_cache: {
        Row: {
          app_id: string;
          project_id: string | null;
          repo: string;
          branch: string;
          result: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["stack_cache"]["Row"]> &
          Pick<Database["public"]["Tables"]["stack_cache"]["Row"], "repo" | "result">;
        Update: Partial<Database["public"]["Tables"]["stack_cache"]["Row"]>;
        Relationships: [];
      };
      repo_cache: {
        Row: {
          app_id: string;
          connection_id: string;
          repos: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["repo_cache"]["Row"]> &
          Pick<Database["public"]["Tables"]["repo_cache"]["Row"], "connection_id" | "repos">;
        Update: Partial<Database["public"]["Tables"]["repo_cache"]["Row"]>;
        Relationships: [];
      };
      stats_cache: {
        Row: {
          app_id: string;
          project_id: string | null;
          repo: string;
          branch: string;
          result: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["stats_cache"]["Row"]> &
          Pick<Database["public"]["Tables"]["stats_cache"]["Row"], "repo" | "result">;
        Update: Partial<Database["public"]["Tables"]["stats_cache"]["Row"]>;
        Relationships: [];
      };
      sensitive_cache: {
        Row: {
          project_id: string;
          result: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sensitive_cache"]["Row"]> &
          Pick<Database["public"]["Tables"]["sensitive_cache"]["Row"], "project_id" | "result">;
        Update: Partial<Database["public"]["Tables"]["sensitive_cache"]["Row"]>;
        Relationships: [];
      };
      scans: {
        Row: {
          id: string;
          app_id: string;
          project_id: string;
          connection_id: string;
          repo: string;
          branch: string;
          status: string;
          summary: Json;
          commit_sha: string;
          commit_message: string;
          commit_author: string;
          commit_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["scans"]["Row"]> &
          Pick<Database["public"]["Tables"]["scans"]["Row"], "id" | "app_id" | "project_id" | "connection_id" | "repo" | "branch">;
        Update: Partial<Database["public"]["Tables"]["scans"]["Row"]>;
        Relationships: [];
      };
      findings: {
        Row: {
          id: string;
          app_id: string;
          scan_id: string;
          rule_id: string;
          severity: string;
          message: string;
          file_path: string;
          start_line: number;
          end_line: number;
          snippet: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["findings"]["Row"]> &
          Pick<Database["public"]["Tables"]["findings"]["Row"], "id" | "app_id" | "scan_id" | "rule_id" | "severity" | "message" | "file_path" | "start_line" | "end_line">;
        Update: Partial<Database["public"]["Tables"]["findings"]["Row"]>;
        Relationships: [];
      };
      custom_rules: {
        Row: {
          id: string;
          app_id: string;
          rule_id: string;
          severity: string;
          message: string;
          pattern: string;
          extensions: string[];
          enabled: boolean;
          type: string;
          yaml_content: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["custom_rules"]["Row"]> &
          Pick<Database["public"]["Tables"]["custom_rules"]["Row"], "id" | "app_id" | "rule_id" | "message" | "pattern">;
        Update: Partial<Database["public"]["Tables"]["custom_rules"]["Row"]>;
        Relationships: [];
      };
      opengrep_rules: {
        Row: {
          id: string;
          app_id: string;
          rule_id: string;
          enabled: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["opengrep_rules"]["Row"]> &
          Pick<Database["public"]["Tables"]["opengrep_rules"]["Row"], "id" | "app_id" | "rule_id">;
        Update: Partial<Database["public"]["Tables"]["opengrep_rules"]["Row"]>;
        Relationships: [];
      };
      sonarqube_rules: {
        Row: {
          id: string;
          app_id: string;
          rule_id: string;
          enabled: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sonarqube_rules"]["Row"]> &
          Pick<Database["public"]["Tables"]["sonarqube_rules"]["Row"], "id" | "app_id" | "rule_id">;
        Update: Partial<Database["public"]["Tables"]["sonarqube_rules"]["Row"]>;
        Relationships: [];
      };
      notification_channels: {
        Row: {
          id: string;
          app_id: string;
          type: string;
          config: string;
          enabled: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notification_channels"]["Row"]> &
          Pick<Database["public"]["Tables"]["notification_channels"]["Row"], "id" | "app_id" | "type">;
        Update: Partial<Database["public"]["Tables"]["notification_channels"]["Row"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          app_id: string;
          channel: string;
          title: string;
          message: string;
          read: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notifications"]["Row"]> &
          Pick<Database["public"]["Tables"]["notifications"]["Row"], "id" | "app_id" | "channel" | "title" | "message">;
        Update: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
        Relationships: [];
      };
      server_providers: {
        Row: {
          id: string;
          app_id: string;
          provider: string;
          label: string;
          api_key: string;
          api_secret: string;
          region: string;
          app_runner_connection_arn: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["server_providers"]["Row"]> &
          Pick<Database["public"]["Tables"]["server_providers"]["Row"], "id" | "app_id" | "provider" | "label" | "api_key" | "api_secret">;
        Update: Partial<Database["public"]["Tables"]["server_providers"]["Row"]>;
        Relationships: [];
      };
      deployments: {
        Row: {
          id: string;
          app_id: string;
          provider_id: string;
          git_connection_id: string;
          project_id: string;
          repo: string;
          branch: string;
          status: string;
          logs: string;
          app_url: string;
          tofu_script: string;
          commit_hash: string;
          docker_image: string;
          deploy_strategy: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["deployments"]["Row"]> &
          Pick<Database["public"]["Tables"]["deployments"]["Row"], "id" | "app_id" | "provider_id" | "git_connection_id" | "repo">;
        Update: Partial<Database["public"]["Tables"]["deployments"]["Row"]>;
        Relationships: [];
      };
      ssh_keys: {
        Row: {
          id: string;
          app_id: string;
          label: string;
          public_key: string;
          fingerprint: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ssh_keys"]["Row"]> &
          Pick<Database["public"]["Tables"]["ssh_keys"]["Row"], "id" | "app_id" | "label" | "public_key">;
        Update: Partial<Database["public"]["Tables"]["ssh_keys"]["Row"]>;
        Relationships: [];
      };
      builds: {
        Row: {
          id: string;
          app_id: string;
          provider_id: string;
          codebuild_id: string;
          project_id: string;
          source_repo: string;
          source_ref: string;
          commit_sha: string;
          dockerfile_path: string;
          build_context: string;
          image_repo: string;
          image_uri: string;
          cache_repo_uri: string;
          status: string;
          status_reason: string;
          logs_url: string;
          tags: string;
          build_metadata: string;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["builds"]["Row"]> &
          Pick<Database["public"]["Tables"]["builds"]["Row"], "id" | "app_id" | "source_repo">;
        Update: Partial<Database["public"]["Tables"]["builds"]["Row"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> &
          Pick<Database["public"]["Tables"]["profiles"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: AppRole;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["user_roles"]["Row"]> &
          Pick<Database["public"]["Tables"]["user_roles"]["Row"], "user_id" | "role">;
        Update: Partial<Database["public"]["Tables"]["user_roles"]["Row"]>;
        Relationships: [];
      };
      cloud_providers: {
        Row: {
          id: string;
          name: string;
          kind: string;
          region: string | null;
          connected: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["cloud_providers"]["Row"]> &
          Pick<Database["public"]["Tables"]["cloud_providers"]["Row"], "name" | "kind">;
        Update: Partial<Database["public"]["Tables"]["cloud_providers"]["Row"]>;
        Relationships: [];
      };
      source_connections: {
        Row: {
          id: string;
          name: string;
          provider: string;
          account: string | null;
          connected: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["source_connections"]["Row"]> &
          Pick<Database["public"]["Tables"]["source_connections"]["Row"], "name" | "provider">;
        Update: Partial<Database["public"]["Tables"]["source_connections"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      membership_role: MembershipRole;
      app_role: AppRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
