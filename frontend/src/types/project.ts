export type ProjectSourceType = "repository" | "template";

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
