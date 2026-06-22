# Kiro feature specs (historical)

This directory contains **point-in-time design and task documents** for specific engineering efforts (deploy adapters, observability proxy, SonarQube fixes, etc.).

These files are **not** the product source of truth. They may reference:

- The former **Encore** runtime or **pub/sub** deploy events
- Paths or module names that have since moved to **`backend/src/services/*`**
- Schema locations before consolidation into **`supabase/migrations/`**

For accurate product and architecture documentation, use:

- [`README.md`](../../README.md)
- [`PRODUCT.md`](../../PRODUCT.md)
- [`DESCRIPTION.md`](../../DESCRIPTION.md)
- [`AGENTS.md`](../../AGENTS.md)
- [`docs/MIGRATION_FASTIFY.md`](../../docs/MIGRATION_FASTIFY.md)

When implementing from a spec here, verify behavior against the current Fastify codebase first.
