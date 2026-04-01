// Re-exports for external consumers
export { type GitConnectionResponse, type GitRepo } from "./shared";

// Force Encore to load all endpoint files
import "./endpoints/connections";
import "./endpoints/repos";
import "./endpoints/stats";
import "./endpoints/pull";
import "./endpoints/ai-fix";
import "./analysis";
import "./endpoints/scan-auth";
