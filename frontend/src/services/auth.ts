import { request } from "./request";

export const authApi = {
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
};
