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
  deployStrategy?: "vps" | "managed" | "serverless";
  useDocker?: boolean;
  dockerImage?: string;
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
