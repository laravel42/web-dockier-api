import QRCode from "qrcode";
import { encryptJson, decryptJson } from "../../../shared/auth/crypto.js";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError } from "../../../shared/supabase/query.js";
import { nowIso } from "../../../shared/utils/time.js";
import {
  buildOtpAuthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  matchTotpCounter,
} from "../../../shared/auth/totp.js";
export const TwoFactorError = createDomainErrorClass<"bad_request" | "not_found" | "internal">("TwoFactorError");
export type TwoFactorError = InstanceType<typeof TwoFactorError>;

interface TwoFactorRow {
  two_factor_enabled: boolean;
  two_factor_secret_encrypted: string | null;
  two_factor_recovery_codes: unknown;
  two_factor_last_counter: number | null;
}

async function loadTwoFactorRow(userId: string): Promise<TwoFactorRow> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("two_factor_enabled, two_factor_secret_encrypted, two_factor_recovery_codes, two_factor_last_counter")
    .eq("id", userId)
    .maybeSingle();
  throwOnError(error, TwoFactorError, { internalMsg: "Failed to load user" });
  if (!data) throw new TwoFactorError("User not found", "not_found");
  return data as TwoFactorRow;
}

function readSecret(row: TwoFactorRow): string | null {
  if (!row.two_factor_secret_encrypted) return null;
  try {
    return decryptJson(row.two_factor_secret_encrypted) as string;
  } catch {
    throw new TwoFactorError("Could not read the two-factor secret. Contact an administrator.", "internal");
  }
}

function recoveryHashes(row: TwoFactorRow): string[] {
  return Array.isArray(row.two_factor_recovery_codes)
    ? row.two_factor_recovery_codes.filter((h): h is string => typeof h === "string")
    : [];
}

/**
 * Accept an authenticator code once: only for a time step after the last one
 * used. The conditional UPDATE makes that atomic, so a code seen over a shoulder,
 * or sent twice at once, cannot be spent a second time within its ~90 s.
 */
async function spendTotp(userId: string, row: TwoFactorRow, code: string): Promise<boolean> {
  const secret = readSecret(row);
  const counter = secret ? matchTotpCounter(code, secret) : null;
  if (counter === null) return false;
  const { data, error } = await supabaseAdmin
    .from("users")
    .update({ two_factor_last_counter: counter, updated_at: nowIso() })
    .eq("id", userId)
    .or(`two_factor_last_counter.is.null,two_factor_last_counter.lt.${counter}`)
    .select("id");
  throwOnError(error, TwoFactorError, { internalMsg: "Failed to record the code" });
  return (data?.length ?? 0) > 0;
}

/** Accept a recovery code once; the `contains` filter makes a concurrent second use match nothing. */
async function spendRecoveryCode(userId: string, row: TwoFactorRow, code: string): Promise<boolean> {
  const hashes = recoveryHashes(row);
  const hash = hashRecoveryCode(code);
  if (!hashes.includes(hash)) return false;
  const { data, error } = await supabaseAdmin
    .from("users")
    .update({ two_factor_recovery_codes: hashes.filter((h) => h !== hash), updated_at: nowIso() })
    .eq("id", userId)
    .contains("two_factor_recovery_codes", [hash])
    .select("id");
  throwOnError(error, TwoFactorError, { internalMsg: "Failed to use the recovery code" });
  return (data?.length ?? 0) > 0;
}

/** A 6-digit authenticator code or a recovery code (which is consumed). */
async function spendSecondFactor(userId: string, row: TwoFactorRow, code: string): Promise<boolean> {
  const trimmed = code.trim();
  return /^\d{6}$/.test(trimmed.replace(/\s/g, ""))
    ? spendTotp(userId, row, trimmed)
    : spendRecoveryCode(userId, row, trimmed);
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
      two_factor_last_counter: null,
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
  if (!readSecret(user)) {
    throw new TwoFactorError("Set up two-factor authentication before enabling", "bad_request");
  }
  if (!(await spendTotp(userId, user, token))) {
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

/**
 * Turns 2FA off. Needs a current authenticator or recovery code, so a stolen
 * session cannot strip the second factor; a recovery code works for a lost phone.
 */
export async function disableTwoFactor(userId: string, code: string) {
  const user = await loadTwoFactorRow(userId);
  if (!user.two_factor_enabled) throw new TwoFactorError("Two-factor authentication is not enabled", "bad_request");
  if (!(await spendSecondFactor(userId, user, code))) throw new TwoFactorError("Invalid authentication or recovery code", "bad_request");
  const { error } = await supabaseAdmin
    .from("users")
    .update({
      two_factor_enabled: false,
      two_factor_secret_encrypted: null,
      two_factor_recovery_codes: [],
      two_factor_last_counter: null,
      updated_at: nowIso(),
    })
    .eq("id", userId);
  throwOnError(error, TwoFactorError, { internalMsg: "Failed to disable 2FA" });
  return { success: true as const };
}

/** Replaces every recovery code with ten new ones, shown once. Needs a current code, like disabling. */
export async function regenerateRecoveryCodes(userId: string, code: string) {
  const user = await loadTwoFactorRow(userId);
  if (!user.two_factor_enabled) throw new TwoFactorError("Two-factor authentication is not enabled", "bad_request");
  if (!(await spendSecondFactor(userId, user, code))) throw new TwoFactorError("Invalid authentication or recovery code", "bad_request");
  const { codes, hashes } = generateRecoveryCodes();
  const { error } = await supabaseAdmin
    .from("users")
    .update({ two_factor_recovery_codes: hashes, updated_at: nowIso() })
    .eq("id", userId);
  throwOnError(error, TwoFactorError, { internalMsg: "Failed to regenerate recovery codes" });
  return { recoveryCodes: codes };
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

/** The second factor at sign-in. Returns false for anything that does not match or was already used. */
export async function verifySecondFactor(userId: string, code: string): Promise<boolean> {
  const user = await loadTwoFactorRow(userId);
  if (!user.two_factor_enabled) return false;
  return spendSecondFactor(userId, user, code);
}

/** For /auth/me, so the profile can warn before the codes run out. */
export function countRecoveryCodes(raw: unknown): number {
  return Array.isArray(raw) ? raw.length : 0;
}
