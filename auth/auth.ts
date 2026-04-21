import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { generateSecret, generateURI, verify as otpVerify } from "otplib";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { db, initDb } from "../lib/db";

// Secrets (with local dev fallbacks)
const DatabaseUrl = secret("DatabaseUrl");
const JwtSecret = secret("JwtSecret");

initDb(DatabaseUrl());

const LOCAL_JWT_FALLBACK = "local-dev-jwt-secret-do-not-use-in-production";

function getJwtSecret(): string {
  const val = JwtSecret();
  return val || LOCAL_JWT_FALLBACK;
}

// ─── Interfaces ───

interface AuthResponse {
  token: string;
  userId: string;
  requires2FA?: boolean;
}

interface RegisterParams {
  email: string;
  password: string;
  name: string;
  appId: string;
}

interface LoginParams {
  email: string;
  password: string;
}

interface Verify2FAParams {
  userId: string;
  token: string;
}

interface Setup2FAResponse {
  secret: string;
  qrCodeUrl: string;
}

export interface AuthData {
  userID: string;
  email: string;
  appId: string;
}

// ─── Auth Handler (used by Encore's auth middleware) ───

import { authHandler } from "encore.dev/auth";
import { Header, Gateway } from "encore.dev/api";

interface AuthParams {
  authorization: Header<"Authorization">;
}

export const auth = authHandler<AuthParams, AuthData>(async (params) => {
  const token = params.authorization.replace("Bearer ", "");
  try {
    const jwtSecretValue = getJwtSecret();
    const decoded = jwt.verify(token, jwtSecretValue) as {
      userId: string;
      email: string;
      appId: string;
    };
    return { userID: decoded.userId, email: decoded.email, appId: decoded.appId };
  } catch {
    throw APIError.unauthenticated("Invalid or expired token");
  }
});

export const gateway = new Gateway({
  authHandler: auth,
});

// ─── Helper ───

function generateToken(userId: string, email: string, appId: string): string {
  return jwt.sign({ userId, email, appId }, getJwtSecret(), { expiresIn: "7d" });
}

// ─── Register ───

export const register = api(
  { expose: true, method: "POST", path: "/auth/register" },
  async (params: RegisterParams): Promise<AuthResponse> => {
    const existing = await db.queryRow`
      SELECT id FROM users WHERE email = ${params.email}`;
    if (existing) throw APIError.alreadyExists("Email already registered");

    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(params.password, 12);

    await db.exec`
      INSERT INTO users (id, email, password_hash, name, app_id, created_at)
      VALUES (${id}, ${params.email}, ${hashedPassword}, ${params.name}, ${params.appId}, NOW())`;

    return { token: generateToken(id, params.email, params.appId), userId: id };
  }
);

// ─── Login ───

export const login = api(
  { expose: true, method: "POST", path: "/auth/login" },
  async (params: LoginParams): Promise<AuthResponse> => {
    const user = await db.queryRow<{
      id: string;
      email: string;
      password_hash: string;
      two_factor_enabled: boolean;
      app_id: string;
    }>`SELECT id, email, password_hash, two_factor_enabled, app_id FROM users WHERE email = ${params.email}`;

    if (!user) throw APIError.notFound("Invalid credentials");

    const valid = await bcrypt.compare(params.password, user.password_hash);
    if (!valid) throw APIError.unauthenticated("Invalid credentials");

    if (user.two_factor_enabled) {
      const tempToken = jwt.sign(
        { userId: user.id, email: user.email, appId: user.app_id, pending2FA: true },
        getJwtSecret(),
        { expiresIn: "5m" }
      );
      return { token: tempToken, userId: user.id, requires2FA: true };
    }

    return { token: generateToken(user.id, user.email, user.app_id), userId: user.id };
  }
);

// ─── 2FA Setup ───

import { getAuthData } from "~encore/auth";

export const setup2FA = api(
  { expose: true, method: "POST", path: "/auth/2fa/setup", auth: true },
  async (): Promise<Setup2FAResponse> => {
    const authData = getAuthData()!;
    const twoFactorSecret = generateSecret();

    await db.exec`
      UPDATE users SET two_factor_secret = ${twoFactorSecret} WHERE id = ${authData.userID}`;

    const otpauthUrl = generateURI({
      issuer: "Dockier",
      label: authData.email,
      secret: twoFactorSecret,
    });
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    return { secret: twoFactorSecret, qrCodeUrl };
  }
);

// ─── 2FA Enable ───

export const enable2FA = api(
  { expose: true, method: "POST", path: "/auth/2fa/enable", auth: true },
  async (params: { token: string }): Promise<{ success: boolean }> => {
    const authData = getAuthData()!;
    const user = await db.queryRow<{ two_factor_secret: string }>`
      SELECT two_factor_secret FROM users WHERE id = ${authData.userID}`;

    if (!user?.two_factor_secret)
      throw APIError.failedPrecondition("2FA not set up yet");

    const result = await otpVerify({
      token: params.token,
      secret: user.two_factor_secret,
    });
    if (!result.valid) throw APIError.invalidArgument("Invalid 2FA token");

    await db.exec`
      UPDATE users SET two_factor_enabled = true WHERE id = ${authData.userID}`;

    return { success: true };
  }
);

// ─── 2FA Verify (during login) ───

export const verify2FA = api(
  { expose: true, method: "POST", path: "/auth/2fa/verify" },
  async (params: Verify2FAParams): Promise<AuthResponse> => {
    const user = await db.queryRow<{
      id: string;
      email: string;
      two_factor_secret: string;
      app_id: string;
    }>`SELECT id, email, two_factor_secret, app_id FROM users WHERE id = ${params.userId}`;

    if (!user) throw APIError.notFound("User not found");

    const result = await otpVerify({
      token: params.token,
      secret: user.two_factor_secret,
    });
    if (!result.valid) throw APIError.unauthenticated("Invalid 2FA token");

    return { token: generateToken(user.id, user.email, user.app_id), userId: user.id };
  }
);

// ─── Get Current User (Me) ───

export const getMe = api(
  { expose: true, method: "GET", path: "/auth/me", auth: true },
  async (): Promise<{ userId: string; email: string; name: string; roleId: string; appId: string }> => {
    const authData = getAuthData()!;
    const user = await db.queryRow<{ id: string; email: string; name: string; role_id: string | null; app_id: string }>`
      SELECT id, email, name, role_id, app_id FROM users WHERE id = ${authData.userID}`;
    if (!user) throw APIError.notFound("User not found");
    return { userId: user.id, email: user.email, name: user.name, roleId: user.role_id || "", appId: user.app_id };
  }
);
