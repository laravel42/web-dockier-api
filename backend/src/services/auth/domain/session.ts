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

/** What sign-in needs to resume once the second factor is checked. */
export interface TwoFactorChallenge {
  userId: string;
  email: string;
  displayName: string;
  metadataTenantName?: string;
  tenantSlug?: string;
  tenantName?: string;
}

const CHALLENGE_PURPOSE = "2fa-challenge";

/**
 * Proof that the email code was correct, valid for 5 minutes. It carries no
 * tenantId and a `purpose`, so verifyAuthToken never accepts it as a session.
 */
export function signTwoFactorChallenge(challenge: TwoFactorChallenge): string {
  return jwt.sign({ ...challenge, purpose: CHALLENGE_PURPOSE }, env.JWT_SECRET, { expiresIn: "5m" });
}

export function verifyTwoFactorChallenge(token: string): TwoFactorChallenge | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as Partial<TwoFactorChallenge> & { purpose?: string };
    if (decoded.purpose !== CHALLENGE_PURPOSE || !decoded.userId || !decoded.email || !decoded.displayName) return null;
    return {
      userId: decoded.userId,
      email: decoded.email,
      displayName: decoded.displayName,
      metadataTenantName: decoded.metadataTenantName,
      tenantSlug: decoded.tenantSlug,
      tenantName: decoded.tenantName,
    };
  } catch {
    return null;
  }
}
