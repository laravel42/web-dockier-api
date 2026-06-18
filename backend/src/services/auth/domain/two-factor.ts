import QRCode from "qrcode";
import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError } from "../../../shared/supabase/query.js";
import { buildOtpAuthUrl, generateTotpSecret, verifyTotpToken } from "../../../shared/totp.js";

export const TwoFactorError = createDomainErrorClass<"bad_request" | "not_found" | "internal">("TwoFactorError");
export type TwoFactorError = InstanceType<typeof TwoFactorError>;

export async function setupTwoFactor(userId: string, email: string) {
  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("two_factor_enabled")
    .eq("id", userId)
    .maybeSingle();

  throwOnError(error, TwoFactorError, { internalMsg: "Failed to load user" });
  if (!user) throw new TwoFactorError("User not found", "not_found");
  if (user.two_factor_enabled) {
    throw new TwoFactorError("Two-factor authentication is already enabled", "bad_request");
  }

  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpAuthUrl(email, secret);
  const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      two_factor_secret: secret,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  throwOnError(updateError, TwoFactorError, { internalMsg: "Failed to save 2FA secret" });

  return { secret, qrCodeUrl };
}

export async function enableTwoFactor(userId: string, token: string) {
  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("two_factor_secret, two_factor_enabled")
    .eq("id", userId)
    .maybeSingle();

  throwOnError(error, TwoFactorError, { internalMsg: "Failed to load user" });
  if (!user) throw new TwoFactorError("User not found", "not_found");
  if (user.two_factor_enabled) {
    throw new TwoFactorError("Two-factor authentication is already enabled", "bad_request");
  }
  if (!user.two_factor_secret) {
    throw new TwoFactorError("Set up two-factor authentication before enabling", "bad_request");
  }

  if (!verifyTotpToken(token, user.two_factor_secret)) {
    throw new TwoFactorError("Invalid verification code", "bad_request");
  }

  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      two_factor_enabled: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  throwOnError(updateError, TwoFactorError, { internalMsg: "Failed to enable 2FA" });

  return { success: true as const };
}
