import { CopyIcon, CircleCheckIcon } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

import type { DomainAttachmentRecord } from "@/types";

/**
 * One DNS record a user must publish, with its purpose and a copy button.
 *
 * Shared between the attachment card and the per-domain instructions panel so
 * the two surfaces cannot show different records for the same domain.
 */
export default function DnsRecordCard({ record }: { record: DomainAttachmentRecord }) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm bg-bg px-1.5 py-0.5 font-mono text-xs text-text-secondary">
          {record.type}
        </span>
        <p className="text-xs text-text-muted">{record.purpose}</p>
      </div>

      <dl className="mt-2 grid gap-2">
        {(
          [
            ["name", "Name", record.name],
            ["value", "Value", record.value],
          ] as const
        ).map(([field, label, text]) => (
          <div key={field} className="flex items-start gap-2">
            <dt className="w-12 shrink-0 pt-1 text-xs text-text-muted">{label}</dt>
            <dd className="flex min-w-0 flex-1 items-start gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-xs text-text">{text}</code>
              <button
                type="button"
                onClick={() => void copy(text, field)}
                className="shrink-0 rounded-sm p-1 text-text-muted hover:text-text"
                aria-label={`Copy ${label.toLowerCase()}`}
              >
                {copied === field ? (
                  <CircleCheckIcon className="size-3.5 text-success-500" aria-hidden="true" />
                ) : (
                  <CopyIcon className="size-3.5" aria-hidden="true" />
                )}
              </button>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
