import QRCode from "qrcode";
import { encryptJson, readEncryptedOr } from "../../../shared/auth/crypto.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError } from "../../../shared/supabase/query.js";
import { nowIso } from "../../../shared/utils/time.js";
import {
  buildOtpAuthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpToken,
} from "../../../shared/auth/totp.js";
export const TwoFactorError = createDomainErrorClass<"bad_request" | "not_found" | "internal">("TwoFactorError");
export type TwoFactorError = InstanceType<typeof TwoFactorError>;

interface TwoFactorRow {
  two_factor_enabled: boolean;
  two_factor_secret: string | null;
  two_factor_secret_encrypted: string | null;
  two_factor_recovery_codes: unknown;
}

async function loadTwoFactorRow(userId: string): Promise<TwoFactorRow> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("two_factor_enabled, two_factor_secret, two_factor_secret_encrypted, two_factor_recovery_codes")
    .eq("id", userId)
    .maybeSingle();
  throwOnError(error, TwoFactorError, { internalMsg: "Failed to load user" });
  if (!data) throw new TwoFactorError("User not found", "not_found");
  return data as TwoFactorRow;
}

/** shortcut: falls back to the plaintext column for secrets written before 0090; drop it once none is left. */
function readSecret(row: TwoFactorRow): string | null {
  try {
    return readEncryptedOr<string | null>(row.two_factor_secret_encrypted, row.two_factor_secret);
  } catch {
    throw new TwoFactorError("Could not read the two-factor secret. Contact an administrator.", "internal");
  }
}

function recoveryHashes(row: TwoFactorRow): string[] {
  return Array.isArray(row.two_factor_recovery_codes)
    ? row.two_factor_recovery_codes.filter((h): h is string => typeof h === "string")
    : [];
}

export async function setupTwoFactor(userId: string, email: string) {
  const user = await loadTwoFactorRow(userId);
  if (user.two_factor_enabled) {
    throw new TwoFactorError("Two-factor authentication is already enabled", "bad_request");
  }
  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpAuthUrl(email, secret);
  const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);
  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      two_factor_secret_encrypted: encryptJson(secret),
      two_factor_secret: null,
      updated_at: nowIso(),
    })
    .eq("id", userId);
  throwOnError(updateError, TwoFactorError, { internalMsg: "Failed to save 2FA secret" });
  return { secret, qrCodeUrl };
}

/** Enables 2FA and returns the recovery codes, the only time they are ever shown. */
export async function enableTwoFactor(userId: string, token: string) {
  const user = await loadTwoFactorRow(userId);
  if (user.two_factor_enabled) {
    throw new TwoFactorError("Two-factor authentication is already enabled", "bad_request");
  }
  const secret = readSecret(user);
  if (!secret) {
    throw new TwoFactorError("Set up two-factor authentication before enabling", "bad_request");
  }
  if (!verifyTotpToken(token, secret)) {
    throw new TwoFactorError("Invalid verification code", "bad_request");
  }
  const { codes, hashes } = generateRecoveryCodes();
  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      two_factor_enabled: true,
      two_factor_recovery_codes: hashes,
      updated_at: nowIso(),
    })
    .eq("id", userId);
  throwOnError(updateError, TwoFactorError, { internalMsg: "Failed to enable 2FA" });
  return { success: true as const, recoveryCodes: codes };
}

export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("two_factor_enabled")
    .eq("id", userId)
    .maybeSingle();
  throwOnError(error, TwoFactorError, { internalMsg: "Failed to load user" });
  return data?.two_factor_enabled === true;
}

/**
 * The second factor at sign-in: a 6-digit authenticator code, or a recovery code,
 * which is consumed. Returns false for anything that does not match.
 */
export async function verifySecondFactor(userId: string, code: string): Promise<boolean> {
  const user = await loadTwoFactorRow(userId);
  if (!user.two_factor_enabled) return false;
  const trimmed = code.trim();
  if (/^\d{6}$/.test(trimmed.replace(/\s/g, ""))) {
    const secret = readSecret(user);
    return !!secret && verifyTotpToken(trimmed, secret);
  }
  const hashes = recoveryHashes(user);
  const hash = hashRecoveryCode(trimmed);
  if (!hashes.includes(hash)) return false;
  // shortcut: read-then-write, so two concurrent sign-ins could both spend the same code; make it a conditional RPC if that matters.
  const { error } = await supabaseAdmin
    .from("users")
    .update({ two_factor_recovery_codes: hashes.filter((h) => h !== hash), updated_at: nowIso() })
    .eq("id", userId);
  throwOnError(error, TwoFactorError, { internalMsg: "Failed to use the recovery code" });
  return true;
}
