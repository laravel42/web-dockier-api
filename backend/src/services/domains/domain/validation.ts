/**
 * Domain-name validation, one message per problem.
 *
 * The schema this replaces used a single regex with one message — "Invalid
 * domain name format" — which told a user that something was wrong but never
 * what. A typo, a pasted URL, a trailing slash and an unsupported wildcard all
 * produced the same six words.
 *
 * Rule ORDER is behaviour, not style. The wildcard check runs before the
 * charset check so `*.example.com` is told wildcards are unsupported rather
 * than that `*` is not a permitted character — which would be true but useless.
 */

import { normalizeHost } from "./static/apex.js";

export type DomainValidationResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

/** Max total length of a DNS name. */
const MAX_NAME_LENGTH = 253;
/** Max length of one DNS label. */
const MAX_LABEL_LENGTH = 63;

/**
 * A TLD is alphabetic, or a punycode A-label for an internationalised one.
 * Punycode is accepted as given; Unicode input fails the charset rule rather
 * than being converted, which would need a new dependency for no requirement.
 */
const TLD_PATTERN = /^(?:[a-z]{2,}|xn--[a-z0-9-]{2,})$/;

const LABEL_CHARSET = /^[a-z0-9-]+$/;

export function validateDomainName(raw: string): DomainValidationResult {
  // 1. Non-empty.
  if (!raw || !raw.trim()) {
    return { ok: false, message: "Enter a domain name." };
  }

  // Normalize first, so `WWW.Example.com.` and `www.example.com` are one
  // domain and every rule below sees the stored form.
  const name = normalizeHost(raw);

  // 2. No scheme.
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(name) || name.startsWith("//")) {
    return {
      ok: false,
      message: "Enter just the domain name, without \"http://\" or \"https://\".",
    };
  }

  // 3. No path, query, port, or whitespace.
  if (name.includes("/")) {
    return { ok: false, message: "Enter just the domain name, without a path." };
  }
  if (name.includes("?") || name.includes("#")) {
    return { ok: false, message: "Enter just the domain name, without a query string." };
  }
  if (name.includes(":")) {
    return { ok: false, message: "Enter just the domain name, without a port number." };
  }
  if (/\s/.test(name)) {
    return { ok: false, message: "A domain name cannot contain spaces." };
  }

  // 4. Total length.
  if (name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      message: `A domain name cannot be longer than ${MAX_NAME_LENGTH} characters.`,
    };
  }

  // 5. At least one dot.
  if (!name.includes(".")) {
    return {
      ok: false,
      message: `"${name}" is not a full domain name. Include the extension, for example "${name}.com".`,
    };
  }

  const labels = name.split(".");

  // 6. No empty label.
  if (labels.some((label) => label.length === 0)) {
    return {
      ok: false,
      message: "A domain name cannot contain an empty part, or two dots in a row.",
    };
  }

  // 7. Label length.
  const tooLong = labels.find((label) => label.length > MAX_LABEL_LENGTH);
  if (tooLong) {
    return {
      ok: false,
      message: `"${tooLong}" is too long — each part of a domain name can be at most ${MAX_LABEL_LENGTH} characters.`,
    };
  }

  // 8. No leading or trailing hyphen on any label.
  const badHyphen = labels.find((label) => label.startsWith("-") || label.endsWith("-"));
  if (badHyphen) {
    return {
      ok: false,
      message: `"${badHyphen}" cannot start or end with a hyphen.`,
    };
  }

  // 9. Wildcards. BEFORE the charset rule on purpose — see the file header.
  if (name.startsWith("*.") || name.includes("*")) {
    return {
      ok: false,
      message:
        "Wildcard domains are not supported. Add each subdomain you want to serve individually.",
    };
  }

  // 10. Charset.
  const badLabel = labels.find((label) => !LABEL_CHARSET.test(label));
  if (badLabel) {
    return {
      ok: false,
      message:
        `"${badLabel}" contains characters that are not allowed in a domain name. ` +
        "Use only letters, numbers and hyphens. For an internationalised domain, enter its " +
        "punycode form (it starts with \"xn--\").",
    };
  }

  // 11. The TLD.
  const tld = labels[labels.length - 1];
  if (!TLD_PATTERN.test(tld)) {
    return {
      ok: false,
      message: `"${tld}" is not a valid domain extension.`,
    };
  }

  return { ok: true, name };
}
