-- Record LLM false-positive judgements instead of acting on them destructively.
--
-- The SAST aggregator runs findings through an LLM to filter false positives.
-- It previously *deleted* the suppressed entries from the array before writing:
-- no flag, no reason, no record. A model omitting one index silently erased a
-- real vulnerability, and there was no way to audit what had been removed or to
-- recover from a bad filtering run.
--
-- Suppression is now a marked state. Every finding the engines produce is
-- persisted; `suppressed_by_llm` records the verdict and `suppression_reason`
-- records why. Consumers that want the filtered view select
-- `WHERE NOT suppressed_by_llm`, which is recoverable — deletion was not.
--
-- Re-runnable: ADD COLUMN IF NOT EXISTS, and the backfill only touches NULLs.

ALTER TABLE findings ADD COLUMN IF NOT EXISTS suppressed_by_llm BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS suppression_reason TEXT;

-- Rows written before this migration were never LLM-filtered at all, so `false`
-- (the column default) is the correct value for them; nothing to backfill.

-- The overwhelmingly common read is "show me the findings that survived
-- filtering", so index that path rather than the whole column.
CREATE INDEX IF NOT EXISTS idx_findings_scan_active
    ON findings(scan_id)
    WHERE NOT suppressed_by_llm;

COMMENT ON COLUMN findings.suppressed_by_llm IS
    'True when the LLM false-positive filter judged this finding a false positive. '
    'The row is retained either way; filtered views use WHERE NOT suppressed_by_llm.';
COMMENT ON COLUMN findings.suppression_reason IS
    'Model-supplied justification for a suppression. NULL when not suppressed.';
