/**
 * Code Analysis Routes — Composer
 *
 * Registers all code-analysis sub-route modules.
 * Each module handles a focused domain:
 *   - websocket: real-time scan status via WebSocket
 *   - scans: scan CRUD and execution
 *   - findings: scan findings listing
 *   - custom-rules: custom rule CRUD
 *   - semgrep-rules: filesystem-based semgrep rule management
 *   - sonarqube: SonarQube quality profile and rule management
 *   - rule-overrides: global rule override management
 */

import type { FastifyInstance } from "fastify";
import { registerScanWebSocketRoutes } from "./routes/websocket.js";
import { registerScanRoutes } from "./routes/scans.js";
import { registerFindingRoutes } from "./routes/findings.js";
import { registerCustomRuleRoutes } from "./routes/custom-rules.js";
import { registerSemgrepRuleRoutes } from "./routes/semgrep-rules.js";
import { registerSonarQubeRoutes } from "./routes/sonarqube.js";
import { registerRuleOverrideRoutes } from "./routes/rule-overrides.js";

export async function registerCodeAnalysisRoutes(app: FastifyInstance) {
  await registerScanWebSocketRoutes(app);
  await registerScanRoutes(app);
  await registerFindingRoutes(app);
  await registerCustomRuleRoutes(app);
  await registerSemgrepRuleRoutes(app);
  await registerSonarQubeRoutes(app);
  await registerRuleOverrideRoutes(app);
}
