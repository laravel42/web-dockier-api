// ─── Deploy Service ───
// This file re-exports the public API from the split modules.
// All endpoints, types, and the pub/sub topic are defined in their respective files.

// Shared types and topic
export { deployTopic, type DeployEvent, type Deployment, type ProviderResponse } from "./shared";

// API endpoints are auto-discovered by Encore from these files:
// - providers.ts     → /deploy/providers/*
// - ssh-keys.ts      → /deploy/ssh-keys/*
// - deployments.ts   → /deploy/deployments/*
// - webhook.ts       → /deploy/webhook/*
// - tofu.ts          → /deploy/tofu/*
// - processor/       → pub/sub subscription (deploy-processor)

// Force Encore to load all endpoint files
import "./endpoints/providers";
import "./endpoints/ssh-keys";
import "./endpoints/deployments";
import "./endpoints/webhook";
import "./endpoints/tofu";
import "./processor";
