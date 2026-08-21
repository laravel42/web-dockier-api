import { request } from "./request";
import type { TenantMembership } from "../types";

/** Response shape shared by all login/verify endpoints. */
interface AuthSessionResponse {
  session: { token: string; userId: string; tenantId: string };
  memberships: TenantMembership[];
}

export const authApi = {
  demoLogin: () =>
    request<AuthSessionResponse>("/auth/demo-login", {
      method: "POST",
      headers: { Authorization: "" },
    }),

  passwordLogin: (data: { email: string; password: string }) =>
    request<AuthSessionResponse>("/auth/password/login", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: "" },
    }),

  startRegistration: (data: { email: string; displayName: string; tenantName?: string; redirectTo?: string }) =>
    request<{ success: true; message: string }>("/auth/register/start", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: "" },
    }),

  verifyRegistration: (data: { email: string; token: string; tenantName?: string }) =>
    request<AuthSessionResponse>("/auth/passwordless/verify", {
      method: "POST",
      body: JSON.stringify({
        ...data,
        type: "signup",
      }),
      headers: { Authorization: "" },
    }),

  startPasswordless: (data: { email: string; redirectTo?: string }) =>
    request<{ success: true; message: string }>("/auth/passwordless/start", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: "" },
    }),

  verifyPasswordless: (data: {
    email: string;
    token: string;
    type?: "email" | "magiclink" | "signup";
    tenantSlug?: string;
    tenantName?: string;
  }) =>
    request<AuthSessionResponse>("/auth/passwordless/verify", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { Authorization: "" },
    }),

  listMemberships: () => request<{ memberships: TenantMembership[] }>("/auth/memberships"),

  switchTenant: (tenantId: string) =>
    request<{ token: string; userId: string; tenantId: string }>(
      `/auth/tenants/${tenantId}/switch`,
      { method: "POST" },
    ),

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
      roleId: string;
      roleName: string;
      systemKey: string | null;
      isOwner: boolean;
      permissions: string[];
      memberships: TenantMembership[];
      twoFactorEnabled: boolean;
    }>("/auth/me"),
};
