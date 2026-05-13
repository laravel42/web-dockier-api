import { request } from "./request";

export type TenantRole = "admin" | "member";
export type TenantMembership = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: TenantRole;
};

export const authApi = {
  startPasswordless: (data: { email: string; redirectTo?: string }) =>
    request<{ success: true; message: string }>("/auth/passwordless/start", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  verifyPasswordless: (data: {
    email: string;
    token: string;
    type?: "email" | "magiclink" | "signup";
    tenantSlug?: string;
    tenantName?: string;
  }) =>
    request<{
      session: { token: string; userId: string; tenantId: string; role: TenantRole };
      memberships: TenantMembership[];
    }>("/auth/passwordless/verify", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: "" },
    }),

  listMemberships: () => request<{ memberships: TenantMembership[] }>("/auth/memberships"),

  switchTenant: (tenantId: string) =>
    request<{ token: string; userId: string; tenantId: string; role: TenantRole }>(
      `/auth/tenants/${tenantId}/switch`,
      { method: "POST" },
    ),

  register: (data: { email: string; password: string; name: string }) =>
    request<{ token: string; userId: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    request<{ token: string; userId: string; requires2FA?: boolean }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify(data) }
    ),

  verify2FA: (data: { userId: string; token: string }) =>
    request<{ token: string; userId: string }>("/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: "" },
    }),

  setup2FA: () =>
    request<{ secret: string; qrCodeUrl: string }>("/auth/2fa/setup", {
      method: "POST",
    }),

  enable2FA: (token: string) =>
    request<{ success: boolean }>("/auth/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  socialLogin: (data: {
    provider: string;
    code: string;
    redirectUri: string;
  }) =>
    request<{ token: string; userId: string }>("/auth/social", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getMe: () =>
    request<{
      userId: string;
      email: string;
      name: string;
      tenantId: string;
      role: TenantRole;
      roleId: TenantRole;
      appId: string;
      memberships: TenantMembership[];
    }>("/auth/me"),
};
