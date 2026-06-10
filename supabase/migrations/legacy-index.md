# Legacy migration mapping

Historical source migrations were consolidated into root `migrations/`.

## Service migrations -> root files

- `auth/migrations/1_create_auth_tables.up.sql` -> `0005_users.sql`, `0006_social_connections.sql`
- `users/migrations/1_create_users.up.sql` -> `0005_users.sql`
- `users/migrations/2_add_profile_fields.up.sql` -> `0005_users.sql`
- `users/migrations/3_add_role_to_users.up.sql` -> `0005_users.sql`
- `projects/migrations/1_create_projects.up.sql` -> `0007_projects.sql`
- `projects/migrations/2_add_branch_column.up.sql` -> `0007_projects.sql`
- `projects/migrations/3_add_connection_id.up.sql` -> `0007_projects.sql`
- `projects/migrations/4_add_platform.up.sql` -> `0007_projects.sql`
- `projects/migrations/5_add_config.up.sql` -> `0007_projects.sql`
- `roles/migrations/1_create_roles_tables.up.sql` -> `0008_roles.sql`
- `git-integration/migrations/1_create_git_tables.up.sql` -> `0009_git_connections.sql`
- `git-integration/migrations/2_add_repo_url.up.sql` -> `0009_git_connections.sql`
- `git-integration/migrations/3_add_endpoint.up.sql` -> `0009_git_connections.sql`
- `git-integration/migrations/4_create_analysis_cache.up.sql` -> `0010_analysis_cache.sql`
- `git-integration/migrations/5_create_stack_cache.up.sql` -> `0011_stack_cache.sql`
- `git-integration/migrations/6_create_repo_cache.up.sql` -> `0012_repo_cache.sql`
- `git-integration/migrations/7_create_stats_cache.up.sql` -> `0013_stats_cache.sql`
- `git-integration/migrations/8_add_project_id_to_caches.up.sql` -> `0010_analysis_cache.sql`, `0011_stack_cache.sql`, `0013_stats_cache.sql`
- `git-integration/migrations/9_create_sensitive_cache.up.sql` -> `0014_sensitive_cache.sql`
- `code-analysis/migrations/1_create_code_analysis_tables.up.sql` -> `0015_scans.sql`, `0016_findings.sql`
- `code-analysis/migrations/2_create_custom_rules.up.sql` -> `0017_custom_rules.sql`
- `code-analysis/migrations/3_create_project_rule_overrides.up.sql` -> `0018_opengrep_rules.sql`, `0019_sonarqube_rules.sql`
- `code-analysis/migrations/4_add_commit_info.up.sql` -> `0015_scans.sql`
- `code-analysis/migrations/5_add_rule_type.up.sql` -> `0017_custom_rules.sql`
- `notifications/migrations/1_create_notifications_tables.up.sql` -> `0020_notification_channels.sql`, `0021_notifications.sql`
- `deploy/migrations/1_create_deploy_tables.up.sql` -> `0023_server_providers.sql`, `0024_deployments.sql`
- `deploy/migrations/2_add_app_url.up.sql` -> `0024_deployments.sql`
- `deploy/migrations/3_add_updated_at.up.sql` -> `0024_deployments.sql`
- `deploy/migrations/4_add_tofu_script.up.sql` -> `0024_deployments.sql`
- `deploy/migrations/5_add_commit_and_image.up.sql` -> `0024_deployments.sql`
- `deploy/migrations/6_add_deploy_strategy.up.sql` -> `0024_deployments.sql`
- `deploy/migrations/7_add_app_runner_connection.up.sql` -> `0023_server_providers.sql`
- `deploy/migrations/8_create_ssh_keys.up.sql` -> `0025_ssh_keys.sql`
- `deploy/migrations/9_add_project_id.up.sql` -> `0024_deployments.sql`
- `image-builder/migrations/1_create_image_builder_tables.up.sql` -> `0026_builds.sql`
- `image-builder/migrations/2_add_provider_id.up.sql` -> `0026_builds.sql`

## Prisma/Supabase migrations -> root files

- `prisma/migrations/001_init.sql` -> `0001_apps.sql`, `0005_users.sql`, `0006_social_connections.sql`, `0007_projects.sql`, `0008_roles.sql`, `0009_git_connections.sql`, `0010_analysis_cache.sql`, `0015_scans.sql`, `0016_findings.sql`, `0017_custom_rules.sql`, `0018_opengrep_rules.sql`, `0019_sonarqube_rules.sql`, `0020_notification_channels.sql`, `0021_notifications.sql`, `0023_server_providers.sql`, `0024_deployments.sql`, `0025_ssh_keys.sql`, `0026_builds.sql`
- `supabase/migrations/20260509055414_7c83d324-2d57-4637-b5b2-bb5f2cbed3b7.sql` -> `0022_set_updated_at_function.sql`, `0027_profiles.sql`
- `supabase/migrations/20260509055430_7428e740-e79f-4523-9a1d-ced987ea731a.sql` -> `0022_set_updated_at_function.sql`
- `supabase/migrations/20260509064316_5e3c4293-9228-4fc2-9984-71ccaec2ad2d.sql` -> `0028_user_roles.sql`
- `supabase/migrations/20260509065356_1cda5c2d-11af-4dc1-8f81-180c1ee362e8.sql` -> `0029_cloud_providers.sql`, `0030_source_connections.sql`, `0031_custom_access_token_hook.sql`
- `supabase/migrations/20260512_rls_tenant_rbac.sql` -> `0032_rls_tenant_rbac.sql`
