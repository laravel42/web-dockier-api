export type RoleRecord = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
};

export const staticRoles: RoleRecord[] = [
  {
    id: "admin" as const,
    name: "Admin",
    description: "Can manage tenant settings, users, memberships, and projects.",
    permissions: [
      "tenant.manage",
      "membership.manage",
      "project.manage",
      "user.manage",
      "user:view",
      "user:manage",
      "deploy:view",
      "deploy:create",
      "project:delete",
      "credential:manage",
      "notification:manage",
      "organization:manage",
      "scan:manage",
    ],
  },
  {
    id: "member" as const,
    name: "Member",
    description: "Can access tenant resources within assigned organization scope.",
    permissions: ["project.read", "user.read", "user:view", "deploy:view"],
  },
];

export const rolesStore: RoleRecord[] = [...staticRoles];
