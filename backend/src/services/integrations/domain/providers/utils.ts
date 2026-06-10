export function basicAuth(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

export function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}
