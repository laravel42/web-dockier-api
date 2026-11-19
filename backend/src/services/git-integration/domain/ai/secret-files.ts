/**
 * Files whose content must never be sent to OpenAI: env files, keys and
 * credential stores. An issue body can name any path in the tree, and a secret
 * finding lives in exactly these files, so without this a "fix with AI" uploads
 * the secrets it was asked to protect. `.env.example`-style templates stay
 * allowed: they hold names, not values.
 */
const SECRET_BASENAME = [
  /^\.env(\..+)?$/i,
  /^\.?(npmrc|pypirc|netrc|pgpass|htpasswd)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/i,
  /\.(pem|key|p12|pfx|jks|keystore|kdbx|tfstate|tfvars)$/i,
  // Config formats only: src/auth/credentials.ts is code, not a credential store.
  /^(secrets?|credentials?)(\.[\w-]+)?\.(ya?ml|json|toml|ini|env|txt|xml|properties|conf)$/i,
  /^(secrets?|credentials?)$/i,
  /service[-_]?account.*\.json$/i,
  // Composer's auth file (OctoberCMS, Laravel Nova/Spark): marketplace and GitHub tokens.
  /^auth\.json$/i,
];
const TEMPLATE = /\.(example|sample|template|dist)$/i;

export function isSecretFilePath(path: string): boolean {
  const base = path.split("/").at(-1) ?? "";
  if (TEMPLATE.test(base)) return false;
  return SECRET_BASENAME.some((re) => re.test(base));
}
