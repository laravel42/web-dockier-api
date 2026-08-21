import { request } from "./request";

export const rolesApi = {
  list: () =>
    request<{
      roles: Array<{
        id: string;
        name: string;
        description: string;
        systemKey: string | null;
        isSystem: boolean;
        isEditable: boolean;
        isDeletable: boolean;
        permissions: string[];
      }>;
    }>("/roles"),

  create: (data: {
    name: string;
    description?: string;
    permissions: string[];
  }) => request<{ id: string; name: string; permissions: string[] }>("/roles", { method: "POST", body: JSON.stringify(data) }),

  delete: (roleId: string) =>
    request<{ success: true }>(`/roles/${roleId}`, { method: "DELETE" }),

  update: (roleId: string, data: { name?: string; description?: string; permissions?: string[] }) =>
    request<{ success: true }>(`/roles/${roleId}`, { method: "PUT", body: JSON.stringify(data) }),

  get: (roleId: string) =>
    request<{
      id: string;
      name: string;
      description: string;
      systemKey: string | null;
      isSystem: boolean;
      isEditable: boolean;
      isDeletable: boolean;
      permissions: string[];
    }>(`/roles/${roleId}`),
};
