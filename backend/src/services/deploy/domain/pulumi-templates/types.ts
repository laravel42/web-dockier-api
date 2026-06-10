// Shared types for Pulumi deploy templates

export interface DeployParams {
  provider: string;
  region: string;
  appName: string;
  repo: string;
  branch: string;
  runtime: { name: string; version: string; buildCmd: string; startCmd: string; port: number };
  hasDocker: boolean;
  techStack: string[];
  services: Array<{ type: string; name: string; mode: "vps" | "managed" }>;
  deployStrategy?: "vps" | "managed" | "static";
  useDocker?: boolean;
  dockerImage?: string;
  instanceType?: string;
  ecrImageUri?: string;
  /** Public Docker image to pull directly (e.g. "wordpress:latest") — used for template deploys */
  publicDockerImage?: string;
  /** Extra env vars to pass to docker run (e.g. WordPress DB config) */
  dockerEnvVars?: Array<{ name: string; value: string }>;
  /** Additional setup script to run on VPS before Docker (e.g. MySQL install for WordPress) */
  templateSetupScript?: string;
  aiAnalysis?: {
    runtime: string;
    runtimeVersion: string;
    framework: string;
    frameworkVersion: string;
    phpExtensions?: string[];
    nodeVersion?: string;
    buildCommand: string;
    startCommand: string;
    port: number;
    needsScheduler: boolean;
    needsQueueWorker: boolean;
    needsWebsockets: boolean;
    envVars: string[];
    postDeployCommands: string[];
    nginxConfig: "php-fpm" | "reverse-proxy" | "static";
    summary: string;
  };
}
