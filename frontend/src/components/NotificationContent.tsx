import BranchCommitLabel from "./BranchCommitLabel";
import SeverityBadge from "./SeverityBadge";
import type { Notification } from "../types";
import { resolveNotificationMetadata } from "../utils/notificationContent";
import { isScanSecurityClean } from "../utils/scanSummary";

interface Props {
  notification: Notification;
  compact?: boolean;
}

export default function NotificationContent({ notification, compact = false }: Props) {
  const metadata = resolveNotificationMetadata(notification);
  const textCls = compact ? "text-xs leading-snug" : "text-xs/snug";
  const blockMt = compact ? "mt-1" : "mt-1.5";

  if (!metadata) {
    return (
      <span className={`block ${textCls} text-text-muted ${blockMt} line-clamp-2`}>
        {notification.message}
      </span>
    );
  }

  const chipsRow = (
    <div className="flex flex-wrap items-center gap-1.5">
      <BranchCommitLabel
        branch={metadata.branch}
        size={compact ? "compact" : "default"}
      />
      {metadata.kind === "scan" && (
        <>
          {metadata.summary.errors > 0 && (
            <SeverityBadge severity="error" count={metadata.summary.errors} size="compact" />
          )}
          {metadata.summary.warnings > 0 && (
            <SeverityBadge severity="warning" count={metadata.summary.warnings} size="compact" />
          )}
          {metadata.summary.infos > 0 && (
            <SeverityBadge severity="info" count={metadata.summary.infos} size="compact" />
          )}
          {isScanSecurityClean(metadata.summary) && (
            <SeverityBadge severity="clean" label="Clean" size="compact" />
          )}
        </>
      )}
      {metadata.kind === "deploy" && metadata.appUrl && (
        <a
          href={metadata.appUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`truncate max-w-full ${textCls} text-primary hover:text-primary/80`}
          onClick={(event) => event.stopPropagation()}
        >
          {metadata.appUrl}
        </a>
      )}
    </div>
  );

  return (
    <div className={`${blockMt} space-y-1 min-w-0`}>
      <span className={`block truncate ${textCls} text-text-muted`}>{metadata.repo}</span>
      {chipsRow}
    </div>
  );
}
