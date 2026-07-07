export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          password_hash: string | null;
          name: string;
          organization_id: string | null;
          avatar_url: string | null;
          country: string;
          language: string;
          timezone: string;
          two_factor_enabled: boolean;
          two_factor_secret: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["users"]["Row"]> &
          Pick<Database["public"]["Tables"]["users"]["Row"], "id" | "email" | "created_at">;
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
          billing: Json;
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
          role_id: string | null;
          is_owner: boolean;
          status: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["organization_memberships"]["Row"]> &
          Pick<Database["public"]["Tables"]["organization_memberships"]["Row"], "organization_id" | "user_id">;
        Update: Partial<Database["public"]["Tables"]["organization_memberships"]["Row"]>;
        Relationships: [];
      };
      permissions: {
        Row: {
          id: string;
          key: string;
          resource: string;
          action: string;
          description: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["permissions"]["Row"]> &
          Pick<Database["public"]["Tables"]["permissions"]["Row"], "id" | "key" | "resource" | "action">;
        Update: Partial<Database["public"]["Tables"]["permissions"]["Row"]>;
        Relationships: [];
      };
      role_permissions: {
        Row: {
          role_id: string;
          permission_id: string;
        };
        Insert: Database["public"]["Tables"]["role_permissions"]["Row"];
        Update: Partial<Database["public"]["Tables"]["role_permissions"]["Row"]>;
        Relationships: [];
      };
      roles: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string;
          system_key: string | null;
          is_system: boolean;
          is_editable: boolean;
          is_deletable: boolean;
          deleted_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["roles"]["Row"]> &
          Pick<Database["public"]["Tables"]["roles"]["Row"], "id" | "organization_id" | "name">;
        Update: Partial<Database["public"]["Tables"]["roles"]["Row"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          organization_id: string | null;
          name: string;
          repository: string;
          branch: string;
          connection_id: string;
          platform: string;
          source_type: string;
          template: string;
          config: Json;
          settings: Json;
          created_at: string;
          updated_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["projects"]["Row"]> &
          Pick<Database["public"]["Tables"]["projects"]["Row"], "id" | "name" | "repository" | "branch" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [];
      };
      git_connections: {
        Row: {
          id: string;
          organization_id: string;
          provider: string;
          personal_token: string;
          label: string;
          repo_url: string;
          endpoint: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["git_connections"]["Row"]> &
          Pick<Database["public"]["Tables"]["git_connections"]["Row"], "id" | "organization_id" | "provider" | "personal_token">;
        Update: Partial<Database["public"]["Tables"]["git_connections"]["Row"]>;
        Relationships: [];
      };
      analysis_cache: {
        Row: {
          id: string;
          organization_id: string;
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
          id: string;
          organization_id: string;
          project_id: string | null;
          repo: string;
          branch: string;
          result: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["stack_cache"]["Row"]> &
          Pick<Database["public"]["Tables"]["stack_cache"]["Row"], "id" | "repo" | "result">;
        Update: Partial<Database["public"]["Tables"]["stack_cache"]["Row"]>;
        Relationships: [];
      };
      repo_cache: {
        Row: {
          id: string;
          organization_id: string;
          connection_id: string;
          repos: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["repo_cache"]["Row"]> &
          Pick<Database["public"]["Tables"]["repo_cache"]["Row"], "id" | "connection_id" | "repos">;
        Update: Partial<Database["public"]["Tables"]["repo_cache"]["Row"]>;
        Relationships: [];
      };
      stats_cache: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string | null;
          repo: string;
          branch: string;
          result: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["stats_cache"]["Row"]> &
          Pick<Database["public"]["Tables"]["stats_cache"]["Row"], "id" | "repo" | "result">;
        Update: Partial<Database["public"]["Tables"]["stats_cache"]["Row"]>;
        Relationships: [];
      };
      sensitive_cache: {
        Row: {
          id: string;
          project_id: string;
          result: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sensitive_cache"]["Row"]> &
          Pick<Database["public"]["Tables"]["sensitive_cache"]["Row"], "id" | "project_id" | "result">;
        Update: Partial<Database["public"]["Tables"]["sensitive_cache"]["Row"]>;
        Relationships: [];
      };
      scans: {
        Row: {
          id: string;
          organization_id: string;
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
          Pick<Database["public"]["Tables"]["scans"]["Row"], "id" | "organization_id" | "project_id" | "connection_id" | "repo" | "branch">;
        Update: Partial<Database["public"]["Tables"]["scans"]["Row"]>;
        Relationships: [];
      };
      findings: {
        Row: {
          id: string;
          organization_id: string;
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
          Pick<Database["public"]["Tables"]["findings"]["Row"], "id" | "organization_id" | "scan_id" | "rule_id" | "severity" | "message" | "file_path" | "start_line" | "end_line">;
        Update: Partial<Database["public"]["Tables"]["findings"]["Row"]>;
        Relationships: [];
      };
      custom_rules: {
        Row: {
          id: string;
          organization_id: string;
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
          Pick<Database["public"]["Tables"]["custom_rules"]["Row"], "id" | "organization_id" | "rule_id" | "message" | "pattern">;
        Update: Partial<Database["public"]["Tables"]["custom_rules"]["Row"]>;
        Relationships: [];
      };
      opengrep_rules: {
        Row: {
          id: string;
          organization_id: string;
          rule_id: string;
          enabled: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["opengrep_rules"]["Row"]> &
          Pick<Database["public"]["Tables"]["opengrep_rules"]["Row"], "id" | "organization_id" | "rule_id">;
        Update: Partial<Database["public"]["Tables"]["opengrep_rules"]["Row"]>;
        Relationships: [];
      };
      sonarqube_rules: {
        Row: {
          id: string;
          organization_id: string;
          rule_id: string;
          enabled: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sonarqube_rules"]["Row"]> &
          Pick<Database["public"]["Tables"]["sonarqube_rules"]["Row"], "id" | "organization_id" | "rule_id">;
        Update: Partial<Database["public"]["Tables"]["sonarqube_rules"]["Row"]>;
        Relationships: [];
      };
      notification_channels: {
        Row: {
          id: string;
          organization_id: string;
          type: string;
          config: string;
          enabled: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notification_channels"]["Row"]> &
          Pick<Database["public"]["Tables"]["notification_channels"]["Row"], "id" | "organization_id" | "type">;
        Update: Partial<Database["public"]["Tables"]["notification_channels"]["Row"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          organization_id: string;
          channel: string;
          title: string;
          message: string;
          metadata: Record<string, unknown> | null;
          read: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notifications"]["Row"]> &
          Pick<Database["public"]["Tables"]["notifications"]["Row"], "id" | "organization_id" | "channel" | "title" | "message">;
        Update: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
        Relationships: [];
      };
      pm_integrations: {
        Row: {
          id: string;
          organization_id: string;
          provider: string;
          name: string;
          credentials_encrypted: string;
          enabled: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["pm_integrations"]["Row"]> &
          Pick<Database["public"]["Tables"]["pm_integrations"]["Row"], "id" | "organization_id" | "provider" | "credentials_encrypted">;
        Update: Partial<Database["public"]["Tables"]["pm_integrations"]["Row"]>;
        Relationships: [];
      };
      server_providers: {
        Row: {
          id: string;
          organization_id: string;
          provider: string;
          label: string;
          api_key: string;
          api_secret: string;
          region: string;
          app_runner_connection_arn: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["server_providers"]["Row"]> &
          Pick<Database["public"]["Tables"]["server_providers"]["Row"], "id" | "organization_id" | "provider" | "label" | "api_key" | "api_secret">;
        Update: Partial<Database["public"]["Tables"]["server_providers"]["Row"]>;
        Relationships: [];
      };
      deployments: {
        Row: {
          id: string;
          organization_id: string;
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
          infra: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["deployments"]["Row"]> &
          Pick<Database["public"]["Tables"]["deployments"]["Row"], "id" | "organization_id" | "provider_id" | "git_connection_id" | "repo">;
        Update: Partial<Database["public"]["Tables"]["deployments"]["Row"]>;
        Relationships: [];
      };
      ssh_keys: {
        Row: {
          id: string;
          organization_id: string;
          label: string;
          public_key: string;
          fingerprint: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ssh_keys"]["Row"]> &
          Pick<Database["public"]["Tables"]["ssh_keys"]["Row"], "id" | "organization_id" | "label" | "public_key">;
        Update: Partial<Database["public"]["Tables"]["ssh_keys"]["Row"]>;
        Relationships: [];
      };
      builds: {
        Row: {
          id: string;
          organization_id: string;
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
          Pick<Database["public"]["Tables"]["builds"]["Row"], "id" | "organization_id" | "source_repo">;
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
      commands: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          user_id: string;
          command: string;
          status: string;
          output: string;
          started_at: string;
          finished_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["commands"]["Row"]> &
          Pick<Database["public"]["Tables"]["commands"]["Row"], "organization_id" | "project_id" | "user_id" | "command">;
        Update: Partial<Database["public"]["Tables"]["commands"]["Row"]>;
        Relationships: [];
      };
      security_rules: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          name: string;
          path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["security_rules"]["Row"]> &
          Pick<Database["public"]["Tables"]["security_rules"]["Row"], "organization_id" | "project_id" | "name">;
        Update: Partial<Database["public"]["Tables"]["security_rules"]["Row"]>;
        Relationships: [];
      };
      security_rule_credentials: {
        Row: {
          id: string;
          security_rule_id: string;
          username: string;
          password_hash: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["security_rule_credentials"]["Row"]> &
          Pick<Database["public"]["Tables"]["security_rule_credentials"]["Row"], "security_rule_id" | "username" | "password_hash">;
        Update: Partial<Database["public"]["Tables"]["security_rule_credentials"]["Row"]>;
        Relationships: [];
      };
      redirect_rules: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          from_path: string;
          to_path: string;
          type: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["redirect_rules"]["Row"]> &
          Pick<Database["public"]["Tables"]["redirect_rules"]["Row"], "organization_id" | "project_id" | "from_path" | "to_path">;
        Update: Partial<Database["public"]["Tables"]["redirect_rules"]["Row"]>;
        Relationships: [];
      };
      domains: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          name: string;
          is_primary: boolean;
          redirect_www: boolean;
          wildcard: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["domains"]["Row"]> &
          Pick<Database["public"]["Tables"]["domains"]["Row"], "organization_id" | "project_id" | "name">;
        Update: Partial<Database["public"]["Tables"]["domains"]["Row"]>;
        Relationships: [];
      };
      ssl_certificates: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          domain_id: string | null;
          type: string;
          status: string;
          domain_name: string;
          expires_at: string | null;
          issued_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ssl_certificates"]["Row"]> &
          Pick<Database["public"]["Tables"]["ssl_certificates"]["Row"], "organization_id" | "project_id" | "domain_name">;
        Update: Partial<Database["public"]["Tables"]["ssl_certificates"]["Row"]>;
        Relationships: [];
      };
      heartbeats: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          name: string;
          frequency: string;
          grace_period: string;
          status: string;
          last_pinged_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["heartbeats"]["Row"]> &
          Pick<Database["public"]["Tables"]["heartbeats"]["Row"], "organization_id" | "project_id" | "name">;
        Update: Partial<Database["public"]["Tables"]["heartbeats"]["Row"]>;
        Relationships: [];
      };
      project_activity: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          user_id: string | null;
          event_type: string;
          description: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["project_activity"]["Row"]> &
          Pick<Database["public"]["Tables"]["project_activity"]["Row"], "organization_id" | "project_id" | "event_type" | "description">;
        Update: Partial<Database["public"]["Tables"]["project_activity"]["Row"]>;
        Relationships: [];
      };
      project_tags: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          color: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["project_tags"]["Row"]> &
          Pick<Database["public"]["Tables"]["project_tags"]["Row"], "organization_id" | "name">;
        Update: Partial<Database["public"]["Tables"]["project_tags"]["Row"]>;
        Relationships: [];
      };
      project_tag_assignments: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          tag_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["project_tag_assignments"]["Row"]> &
          Pick<Database["public"]["Tables"]["project_tag_assignments"]["Row"], "organization_id" | "project_id" | "tag_id">;
        Update: Partial<Database["public"]["Tables"]["project_tag_assignments"]["Row"]>;
        Relationships: [];
      };
      project_env_files: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          encrypted_content: string;
          iv: string;
          auth_tag: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["project_env_files"]["Row"]> &
          Pick<Database["public"]["Tables"]["project_env_files"]["Row"], "organization_id" | "project_id" | "encrypted_content" | "iv" | "auth_tag">;
        Update: Partial<Database["public"]["Tables"]["project_env_files"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
