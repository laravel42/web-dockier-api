import { guardedFetch } from "../../../../shared/http/guarded-fetch.js";
import { providerError } from "../errors.js";

export function basicAuth(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}
export function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}
/** JSON from a provider; throws a user-facing error on a non-OK reply instead of returning "no data". */
export async function providerJson<T>(provider: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await guardedFetch(url, init);
  if (!res.ok) throw providerError(provider, res.status);
  return (await res.json()) as T;
}
