# Opengrep rule corpus

Vendored from [opengrep-rules](https://github.com/opengrep/opengrep-rules), the
LGPL-2.1 fork of the Semgrep CE engine's rule set. Not a submodule and not synced
by a script: the files here are the ones that run. `getOpengrepRulesDir()` in
`backend/src/shared/utils/paths.ts` points `semgrep --config` at this directory,
which it reads recursively.

## Security categories only

The upstream corpus classifies every rule by a path segment —
`<language>/<framework>/<category>/<rule>.yaml`. This copy keeps only the
categories that produce security findings.

Counted below by the first classifying segment in a rule's path, so the
categories do not overlap (`generic/secrets/security/…` counts once, as
`secrets`):

| Kept | Rules |
| ---- | ----- |
| `security` | 1316 |
| `secrets` | 225 |
| `audit` | 17 |
| uncategorised (Swift webview/sqlite, a few Python) | 12 |
| `crypto` | 1 |
| **total** | **1571** |

That is 1549 `.yaml` plus 22 `.yml` — both extensions are in use here, so a
count that globs only one of them comes out short.

Removed: `best-practice` (182), `correctness` (83), `performance` (23),
`maintainability` (12), `portability` (7), and `yaml/semgrep` (79 meta-rules
that lint Semgrep rule files rather than user code).

**This is why.** Measured over this repository's own `backend/src` and
`frontend/src`, the full corpus reported 894 findings — and 816 of them came
from three rules that have nothing to do with security:

```
664  WARNING  jsx-not-internationalized          (i18n: untranslated JSX strings)
 85  INFO     missing-template-string-indicator   (style: "${x}" in a plain string)
 67  WARNING  react-props-spreading               (React style)
```

The 13 genuine `error` findings — leaked AWS key ids, a Google service account,
JWT tokens, credentials in a URI — were buried under them. The security
categories alone report 55 findings in the same 80 seconds.

Dockier is a security product by its own definition (`PRODUCT.md`: "Static
analysis only. SAST and dependency (SCA) scanning"), so a style or i18n warning
is not a finding it should surface. Shipping them is what made the engine
unusable, and the previous answer was to switch Semgrep off entirely.

## Individually removed rules

A rule can sit in a `security` directory and still be wrong for this product.
These were removed one at a time, which is a different judgement from the
category filter above and needs its own reason each time.

### `json/npm/security/package-dependencies-check.yml`

Fired on any dependency declared with a version range — `^1.2.3`, `~`, `latest`
— one finding per dependency. It produced **46 of the 74** Semgrep findings on
the first real scan after the engine was switched back on (`laravel42/amedeusapp`,
679 files); removing it took that scan to **28**, both figures measured rather
than projected.

It asks for something already done. Its own message accepts a lockfile as the
mitigation:

> Better to specify an exact version or use package-lock.json for a specific
> version of the package.

The rule only reads `package.json` and cannot see the lockfile, so in any npm or
pnpm project — which is every JavaScript project — it reports correct
configuration as a problem. Its own metadata rates it `likelihood: LOW`,
`impact: LOW`, `confidence: LOW`.

Dependency confusion is a real attack; this rule is not a usable detector for
it. Dockier's own dependency scanning (OSV.dev, see `PRODUCT.md`) is where that
concern belongs.

## Adding rules

Re-syncing from upstream brings the removed categories back. Filter them out
again, or the noise returns and someone turns the engine off a second time.
Removed rules are recoverable from git history.

Per-tenant exceptions are a different mechanism: the `opengrep_rules` table
records rule ids a tenant has switched off, read by `listRuleOverrides()` on
every scan. Use that for a rule one customer dislikes; use this directory for
rules that are wrong for the product.
