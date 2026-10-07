import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleIcon,
  LoaderIcon,
  RefreshCwIcon,
} from "lucide-react";

import { domainsApi } from "@/services/domains";
import type {
  AttachmentStage,
  DomainAttachment as Attachment,
  DomainAttachmentEntry,
  DomainAttachmentRecord,
  StageStatus,
} from "@/types";
import { getErrorMessage } from "@/utils/errors";
import { settingsBadgeCls } from "@/utils/styles";
import Button from "@/components/ui/Button";
import DnsRecordCard from "./DnsRecordCard";

/** States where nothing more will happen without someone doing something. */
const TERMINAL_STATES = new Set(["live", "failed", "timed_out"]);

/** How often to re-read while anything is still in flight. */
const POLL_INTERVAL_MS = 20_000;

/**
 * Status is never carried by colour alone.
 *
 * Each status gets an icon AND a text label; colour only reinforces what the
 * two already say, so the card is readable in greyscale and to a screen reader.
 */
const STATUS_META: Record<
  StageStatus,
  { label: string; icon: typeof CircleIcon; className: string }
> = {
  done: { label: "Done", icon: CircleCheckIcon, className: "text-success-500" },
  current: { label: "In progress", icon: LoaderIcon, className: "text-primary-500" },
  pending: { label: "Not started", icon: CircleIcon, className: "text-text-muted" },
  failed: { label: "Failed", icon: CircleAlertIcon, className: "text-danger-500" },
};

const OWNER_LABEL: Record<string, string> = {
  you: "You",
  dockier: "Dockier",
  aws: "AWS",
  google: "Google",
};

function StageRow({ stage }: { stage: AttachmentStage }) {
  const meta = STATUS_META[stage.status];
  const Icon = meta.icon;
  // "Waiting on you" is more useful than "In progress" when the user is the
  // one holding it up.
  const statusLabel =
    stage.status === "current" && stage.owner === "you" ? "Waiting on you" : meta.label;

  return (
    <li
      className="flex items-start gap-3 py-2"
      aria-current={stage.status === "current" ? "step" : undefined}
    >
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${meta.className} ${stage.status === "current" ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-text">{stage.label}</p>
          {stage.owner && (
            // "You" is called out in warning tones when it is the live blocker,
            // so the one stage the user can act on is findable at a glance.
            <span
              className={
                stage.owner === "you" && stage.status === "current"
                  ? settingsBadgeCls.warning
                  : settingsBadgeCls.muted
              }
            >
              {OWNER_LABEL[stage.owner] ?? stage.owner}
            </span>
          )}
          <span className="text-xs text-text-muted">{statusLabel}</span>
        </div>
        {stage.detail && <p className="mt-1 text-xs text-text-secondary">{stage.detail}</p>}
        {stage.eta && stage.status === "current" && (
          <p className="mt-0.5 text-xs text-text-muted">Typically {stage.eta}</p>
        )}
      </div>
    </li>
  );
}

export default function DomainAttachment({
  projectId,
  canManage,
  onRefresh,
  onSupportedChange,
}: {
  projectId: string;
  canManage: boolean;
  onRefresh: () => void;
  /** Reports whether this card is rendering, so the parent can hide its own. */
  onSupportedChange?: (active: boolean) => void;
}) {
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [resuming, setResuming] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  /** Announced politely when the current stage changes. */
  const [announcement, setAnnouncement] = useState("");
  const lastAnnounced = useRef("");

  const load = useCallback(async () => {
    try {
      const next = await domainsApi.attachment(projectId);
      setAttachment(next);
      setError("");

      const current = next.domains
        .map((d) => d.stages.find((s) => s.status === "current")?.label)
        .filter(Boolean)
        .join("; ");
      if (current && current !== lastAnnounced.current) {
        lastAnnounced.current = current;
        setAnnouncement(current);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Could not read the attachment status"));
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const anyInFlight =
    attachment?.domains.some((d) => !TERMINAL_STATES.has(d.verificationState)) ?? false;

  useEffect(() => {
    if (!anyInFlight) return;

    const id = window.setInterval(() => {
      // No point polling a tab nobody is looking at.
      if (document.hidden) return;
      void load();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [anyInFlight, load]);

  const handleCheckNow = async () => {
    setChecking(true);
    setNotice("");
    try {
      const result = await domainsApi.apply(projectId);
      setNotice(result.message);
      await load();
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err, "Could not check the attachment"));
    } finally {
      setChecking(false);
    }
  };

  const handleResume = async (domainId: string) => {
    setResuming(domainId);
    setNotice("");
    try {
      const result = await domainsApi.resume(projectId, domainId);
      setNotice(result.message);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Could not resume the attachment"));
    } finally {
      setResuming(null);
    }
  };

  const active = Boolean(attachment?.supported && (attachment?.domains.length ?? 0) > 0);

  useEffect(() => {
    // Tells the parent whether to keep showing the old sync bar, so the two
    // progress surfaces are never on screen at once.
    onSupportedChange?.(active);
  }, [active, onSupportedChange]);

  if (!attachment || !active) return null;

  return (
    <section className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-text">HTTPS setup</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            Progress continues on its own — this just looks sooner.
          </p>
        </div>
        {canManage && (
          <Button variant="outline" onClick={handleCheckNow} disabled={checking} loading={checking}>
            <RefreshCwIcon className="mr-1.5 size-3.5" aria-hidden="true" />
            {checking ? "Checking…" : "Check now"}
          </Button>
        )}
      </div>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {attachment.blocker && (
        <p className="border-b border-warning-line bg-warning-surface px-4 py-2 text-xs text-warning-ink">
          {attachment.blocker}
        </p>
      )}
      {notice && <p className="border-b border-border px-4 py-2 text-xs text-text-secondary">{notice}</p>}
      {error && (
        <p role="alert" className="border-b border-border px-4 py-2 text-xs text-danger-500">
          {error}
        </p>
      )}

      <ul className="divide-y divide-border">
        {attachment.domains.map((domain: DomainAttachmentEntry) => (
          <li key={domain.domainId} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-sm text-text">{domain.domainName}</p>
              {canManage && domain.resumable && (
                <Button
                  variant="outline"
                  onClick={() => handleResume(domain.domainId)}
                  disabled={resuming === domain.domainId}
                  loading={resuming === domain.domainId}
                >
                  Resume
                </Button>
              )}
            </div>

            <ol className="mt-2">
              {domain.stages.map((stage: AttachmentStage) => (
                <StageRow key={stage.id} stage={stage} />
              ))}
            </ol>

            {domain.records.length > 0 && (
              <div className="mt-3 grid gap-2">
                {domain.records.map((record: DomainAttachmentRecord) => (
                  <DnsRecordCard key={`${record.type}:${record.name}`} record={record} />
                ))}
                {domain.note && <p className="text-xs text-text-muted">{domain.note}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
