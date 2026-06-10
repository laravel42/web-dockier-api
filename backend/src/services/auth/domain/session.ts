import jwt from "jsonwebtoken";
import { env } from "../../../shared/config.js";

export interface TokenPayload {
  userId: string;
  email: string;
  tenantId: string;
}

/**
 * Sign a tenant-scoped JWT for the given user.
 */
export function signTenantToken(payload: TokenPayload): string {
  return jwt.sign(
    { userId: payload.userId, email: payload.email, tenantId: payload.tenantId },
    env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}
