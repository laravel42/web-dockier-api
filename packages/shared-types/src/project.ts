/**
 * Project domain types — single source of truth.
 *
 * Backend Zod schemas (backend/src/services/projects/schemas.ts) validate
 * these shapes at runtime; this module defines them for cross-package use.
 */

export type ProjectSourceType = "repository" | "template";

/**
 * Project-level infrastructure lifecycle state.
 *
 * - `none`      — never deployed, or infrastructure never provisioned
 * - `live`      — infrastructure is currently provisioned
 * - `torn_down` — infrastructure was fully torn down; project + history retained
 */
export type InfraState = "none" | "live" | "torn_down";

/** Blocks shown on the project overview page. */
export interface ProjectConfig {
  overviewBlocks?: Record<string, unknown>[];
}

/** User-configurable project settings stored in the `settings` JSONB column. */
export interface ProjectSettings {
  /** UI color theme for the project card/header. */
  color?: string;
  /** Custom avatar URL or emoji identifier. */
  avatar?: string;
  /** Freeform project notes visible on the overview tab. */
  notes?: string;
  /** Detected or manually set framework version (e.g. "18.2", "5.x"). */
  frameworkVersion?: string;
  /** Subdirectory containing the application source (monorepo support). */
  rootDirectory?: string;
  /** Subdirectory for static web assets (e.g. "public", "dist"). */
  webDirectory?: string;
  /** Custom deploy/build script override. */
  deployScript?: string;
  /** Whether to ping a URL after deployment to verify availability. */
  healthCheckEnabled?: boolean;
  /** URL to ping after deployment completes. */
  healthCheckUrl?: string;
  /** Extensible — additional settings added by integrations or plugins. */
  [key: string]: unknown;
}

export interface Project {
  id: string;
  name: string;
  repository: string;
  branch: string;
  connectionId: string;
  platform?: string;
  sourceType?: ProjectSourceType;
  template?: string;
  config?: ProjectConfig;
  settings?: ProjectSettings;
  /** Infrastructure lifecycle state. Defaults to "none" server-side. */
  infraState?: InfraState;
  lastCommitHash?: string;
  createdAt: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultRepo: string;
  defaultBranch: string;
}
