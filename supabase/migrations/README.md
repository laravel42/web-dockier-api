# Unified migrations

This folder is the single source of truth for all Dockier SQL migrations.

## Structure

- `000x_*.sql`: canonical migration files, ordered by dependency
- `legacy-index.md`: historical mapping from previous service/prisma/supabase migration files to root migrations

## Running migrations

Use your migration runner against files in this folder only.
No migration files outside root `migrations/` should be used.
