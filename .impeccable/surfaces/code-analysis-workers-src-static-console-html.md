---
version: 1
slug: "code-analysis-workers-src-static-console-html"
primary_target: "code-analysis/workers/src/static/console.html"
related_targets: []
---

# Surface brief — SAST service bench

**Scope.** `code-analysis/workers/src/static/console.html`, served by the router at `/`.
**Visitor mode.** Operate (with Read passages for the reference material).

**Audience & job.** An engineer integrating against the SAST services, or on call for
them. Their job: find out whether the services are alive, then exercise the scan API
and any individual worker without reaching for curl.

**Action.** Set credentials once at the bench head, then work down numbered exercises.
Every endpoint the service exposes is runnable from this page.

**Constraints.**
- Self-contained. No build step and no third-party request: it must load on a
  restricted or air-gapped host, and before the SPA exists.
- Tokens are mirrored from `frontend/src/index.css`, not imported, for the same reason.
  When that file's tokens change, this page must be updated deliberately.
- The router does not authenticate; the page holds the token in `localStorage` only
  and sends it as a bearer token.

**Direction.** Runnable worksheet staged as a laboratory bench: engraved panel caps,
counts as lit digit banks reading against a queue scale, the product's measured signal
ramp for status. Memorable moment: the bench readout, where seven services report live
and a killed engine turns the aggregate red within 15 seconds.

**Deliberate deviations.**
- A true monospace is used for payloads and readouts, though `--font-mono` maps to
  Space Grotesk in the product. Aligning JSON in a proportional face harms the task.
- The lit-digit glow keeps the detector's `dark-glow` warning: a glowing digit is the
  staging's own native device, and removing it would delete the world's material to
  silence a check.

**Unresolved.** No confirmed accessibility conformance target for the product; this
surface was built to AA in both themes (measured) as a working assumption.
