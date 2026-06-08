export const E2E_USER_ID = "e2e-user-id";

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

/** Minimal JWT-shaped token so AuthContext can parse the email claim. */
export function createE2eToken(email = "e2e@dockier.test"): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({ email, sub: E2E_USER_ID }),
  );
  return `${header}.${payload}.e2e-smoke`;
}

export const E2E_TOKEN = createE2eToken();
