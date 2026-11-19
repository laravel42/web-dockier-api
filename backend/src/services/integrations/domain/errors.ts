import { createDomainErrorClass } from "../../../shared/supabase/errors.js";

export const IntegrationsError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "conflict" | "internal" | "service_unavailable">("IntegrationsError");
export type IntegrationsError = InstanceType<typeof IntegrationsError>;

/**
 * A provider's non-OK reply as an error the user can act on. These calls used to
 * read any failure as "no data", so a revoked token showed up as an empty list.
 * A provider 401 maps to forbidden, never to our own 401, which would log the user out.
 */
export function providerError(provider: string, status: number): IntegrationsError {
  if (status === 401 || status === 403) {
    return new IntegrationsError(`${provider} rejected the integration's credentials (${status}). Update them in Settings, Integrations.`, "forbidden");
  }
  if (status === 404) return new IntegrationsError(`${provider} could not find that resource (404).`, "not_found");
  if (status === 429 || status >= 500) {
    return new IntegrationsError(`${provider} is unavailable or rate limiting requests (${status}). Try again shortly.`, "service_unavailable");
  }
  return new IntegrationsError(`${provider} rejected the request (${status}).`, "bad_request");
}
