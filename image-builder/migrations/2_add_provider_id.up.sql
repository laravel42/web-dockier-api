-- Store the provider reference so the image-builder can look up credentials on demand
ALTER TABLE builds ADD COLUMN IF NOT EXISTS provider_id TEXT NOT NULL DEFAULT '';
