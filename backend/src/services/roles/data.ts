export const staticRoles = [
  {
    id: "admin" as const,
    name: "Admin",
    description: "Can manage tenant settings, users, memberships, and projects.",
    permissions: ["tenant.manage", "membership.manage", "project.manage", "user.manage"],
  },
  {
    id: "member" as const,
    name: "Member",
    description: "Can access tenant resources within assigned organization scope.",
    permissions: ["project.read", "user.read"],
  },
];
