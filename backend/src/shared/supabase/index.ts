export { supabaseAdmin } from "./client.js";
export { DomainError, type BaseDomainErrorCode, type ErrorMetadata } from "./errors.js";
export {
  throwOnError,
  assertFound,
  unwrapQuery,
  unwrapList,
  throwOnMutationError,
  type PostgrestError,
  type QueryErrorOptions,
} from "./query.js";
