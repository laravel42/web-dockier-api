/**
 * Cloud provider types — single source of truth.
 *
 * Backend Zod schemas: backend/src/services/deploy/schemas.ts
 */

export interface Provider {
  id: string;
  provider: string;
  label: string;
}
