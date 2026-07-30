/**
 * WordPress configuration (wp-config.php) encrypted storage.
 *
 * Same encryption pattern as project env files — AES-256-GCM via shared/crypto.
 */

import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { encrypt, decrypt } from "../../../shared/auth/crypto.js";
import { randomBytes } from "node:crypto";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";
import { throwOnError, throwOnMutationError } from "../../../shared/supabase/query.js";
import { nowIso } from "../../../shared/utils/time.js";

export const WpConfigError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal">("WpConfigError");
export type WpConfigError = InstanceType<typeof WpConfigError>;

// Characters used by WordPress for salt generation (same set as wp_generate_password with special chars)
const SALT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_[]{}<>~`+=,.;:/?|";

/**
 * Generate a 64-character random salt matching WordPress's format.
 */
function generateWpSalt(): string {
  const bytes = randomBytes(64);
  let salt = "";
  for (let i = 0; i < 64; i++) {
    salt += SALT_CHARS[bytes[i] % SALT_CHARS.length];
  }
  return salt;
}

/**
 * Generate a wp-config.php with unique random salts and keys.
 */
export function generateWpConfig(): string {
  return DEFAULT_WP_CONFIG
    .replace(/define\(\s*'(AUTH_KEY|SECURE_AUTH_KEY|LOGGED_IN_KEY|NONCE_KEY|AUTH_SALT|SECURE_AUTH_SALT|LOGGED_IN_SALT|NONCE_SALT|WP_CACHE_KEY_SALT)',\s*'put your unique phrase here'\s*\)/g,
      (match, key) => `define( '${key}', '${generateWpSalt()}' )`,
    );
}

export const DEFAULT_WP_CONFIG = `<?php
/**
 * WordPress Configuration File
 *
 * This file contains the following configurations:
 * - Database settings
 * - Secret keys
 * - Database table prefix
 * - Reverse proxy / HTTPS detection
 * - WordPress debugging
 *
 * @link https://developer.wordpress.org/advanced-administration/wordpress/wp-config/
 */

// ** Database settings ** //
define( 'DB_NAME', 'wordpress' );
define( 'DB_USER', 'wordpress' );
define( 'DB_PASSWORD', 'wordpress' );
define( 'DB_HOST', '172.17.0.1' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

// ** Authentication unique keys and salts ** //
// Generate at: https://api.wordpress.org/secret-key/1.1/salt/
define( 'AUTH_KEY',         'put your unique phrase here' );
define( 'SECURE_AUTH_KEY',  'put your unique phrase here' );
define( 'LOGGED_IN_KEY',    'put your unique phrase here' );
define( 'NONCE_KEY',        'put your unique phrase here' );
define( 'AUTH_SALT',        'put your unique phrase here' );
define( 'SECURE_AUTH_SALT', 'put your unique phrase here' );
define( 'LOGGED_IN_SALT',   'put your unique phrase here' );
define( 'NONCE_SALT',       'put your unique phrase here' );
define( 'WP_CACHE_KEY_SALT', 'put your unique phrase here' );

// ** WordPress database table prefix ** //
$table_prefix = 'wp_';

/* Add any custom values between this line and the "stop editing" line. */

// ** Reverse proxy / load balancer HTTPS detection ** //
if ( isset( $_SERVER["HTTP_X_FORWARDED_PROTO"] ) && $_SERVER["HTTP_X_FORWARDED_PROTO"] === "https" ) {
  $_SERVER["HTTPS"] = "on";
}

// ** Debugging ** //
if ( ! defined( 'WP_DEBUG' ) ) {
  define( 'WP_DEBUG', false );
}
define( 'WP_DEBUG_LOG', false );
define( 'WP_DEBUG_DISPLAY', false );

// ** Memory limit ** //
define( 'WP_MEMORY_LIMIT', '256M' );

/* That's all, stop editing! Happy publishing. */

// ** Absolute path to the WordPress directory ** //
if ( ! defined( 'ABSPATH' ) ) {
  define( 'ABSPATH', __DIR__ . '/' );
}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';
`;

/**
 * Get masked wp-config content (sensitive values replaced with bullets).
 */
export async function getMaskedWpConfig(params: {
  tenantId: string;
  projectId: string;
}): Promise<{ content: string; exists: boolean }> {
  const { tenantId, projectId } = params;

  const { data, error } = await supabaseAdmin
    .from("project_wp_configs")
    .select("encrypted_content, iv, auth_tag")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .maybeSingle();

  throwOnError(error, WpConfigError, { internalMsg: "Failed to fetch WordPress configuration" });
  if (!data) return { content: "", exists: false };

  const decrypted = decrypt({
    encrypted: data.encrypted_content,
    iv: data.iv,
    authTag: data.auth_tag,
  });

  // Mask sensitive values in define() calls
  const masked = decrypted
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      // Preserve comments, empty lines, and non-define lines
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return line;

      // Mask define('KEY', 'value') patterns for sensitive keys
      const defineMatch = trimmed.match(/^define\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/);
      if (defineMatch) {
        const key = defineMatch[1];
        const sensitiveKeys = [
          "DB_PASSWORD", "DB_USER", "DB_NAME", "DB_HOST",
          "AUTH_KEY", "SECURE_AUTH_KEY", "LOGGED_IN_KEY", "NONCE_KEY",
          "AUTH_SALT", "SECURE_AUTH_SALT", "LOGGED_IN_SALT", "NONCE_SALT",
          "WP_CACHE_KEY_SALT",
        ];
        if (sensitiveKeys.includes(key)) {
          return line.replace(/['"]([^'"]*)['"]\s*\)/, "'••••••••' )");
        }
      }
      return line;
    })
    .join("\n");

  return { content: masked, exists: true };
}

/**
 * Get the full decrypted wp-config content.
 */
export async function revealWpConfig(params: {
  tenantId: string;
  projectId: string;
}): Promise<{ content: string; exists: boolean }> {
  const { tenantId, projectId } = params;

  const { data, error } = await supabaseAdmin
    .from("project_wp_configs")
    .select("encrypted_content, iv, auth_tag")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .maybeSingle();

  throwOnError(error, WpConfigError, { internalMsg: "Failed to fetch WordPress configuration" });
  if (!data) return { content: "", exists: false };

  const decrypted = decrypt({
    encrypted: data.encrypted_content,
    iv: data.iv,
    authTag: data.auth_tag,
  });

  return { content: decrypted, exists: true };
}

/**
 * Save (create or update) the wp-config content.
 */
export async function saveWpConfig(params: {
  tenantId: string;
  projectId: string;
  content: string;
}): Promise<void> {
  const { tenantId, projectId, content } = params;

  if (content.length > 128_000) {
    throw new WpConfigError("WordPress configuration file too large (max 128KB)", "bad_request");
  }

  const { encrypted, iv, authTag } = encrypt(content);

  const { data: existing } = await supabaseAdmin
    .from("project_wp_configs")
    .select("id")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabaseAdmin
      .from("project_wp_configs")
      .update({
        encrypted_content: encrypted,
        iv,
        auth_tag: authTag,
        updated_at: nowIso(),
      })
      .eq("id", existing.id);
    throwOnMutationError(error, WpConfigError, { internalMsg: "Failed to save WordPress configuration" });
  } else {
    const { error } = await supabaseAdmin
      .from("project_wp_configs")
      .insert({
        organization_id: tenantId,
        project_id: projectId,
        encrypted_content: encrypted,
        iv,
        auth_tag: authTag,
      });
    throwOnMutationError(error, WpConfigError, { internalMsg: "Failed to create WordPress configuration" });
  }
}
