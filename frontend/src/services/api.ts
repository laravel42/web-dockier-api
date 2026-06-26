// Barrel re-export — all consumers can keep importing from "services/api"
// while the implementation is split into domain-specific modules.
export { authApi } from "./auth";
export { billingApi } from "./billing";
export { usersApi } from "./users";
export { rolesApi } from "./roles";
export { gitApi } from "./git";
export { notificationsApi } from "./notifications";
export { deployApi } from "./deploy";
export { projectsApi } from "./projects";
export { codeAnalysisApi } from "./code-analysis";
export { imageBuilderApi } from "./image-builder";
export { integrationsApi } from "./integrations";
export { commandsApi } from "./commands";
