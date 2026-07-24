export { PERMISSIONS, ALL_PERMISSIONS, CRITICAL_PERMISSIONS, PERMISSION_DEFINITIONS } from "./constants.js";
export type { PermissionKey, PermissionDefinition } from "./constants.js";
export { DEFAULT_ROLE_TEMPLATES, SYSTEM_ROLE_KEYS, getRoleTemplate, getHierarchyLevel } from "./role-templates.js";
export type { RoleTemplate, SystemRoleKey } from "./role-templates.js";
export { authorizationPlugin, hasPermissions, canAssignPermissions, canManageRole, invalidatePermissionCache, clearPermissionCache, destroyPermissionCache } from "./authorization.js";
export type { ResolvedAuth } from "./authorization.js";
