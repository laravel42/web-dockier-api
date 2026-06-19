import type { Notification, NotificationMetadata } from "../services/notifications";

const SCAN_MESSAGE_RE =
  /^Scan of (.+?) \((.+?)\) finished with (\d+) finding\(s\) \((\d+) errors, (\d+) warnings\)\.$/;
const DEPLOY_MESSAGE_RE =
  /^Deployment of (.+?) \((.+?)\) succeeded(?:\. App URL: (.+))?$/;

function parseNotificationMessage(title: string, message: string): NotificationMetadata | null {
  if (title === "Security scan completed") {
    const match = message.match(SCAN_MESSAGE_RE);
    if (!match) return null;
    const [, repo, branch, totalFindings, errors, warnings] = match;
    const total = Number(totalFindings);
    const errorCount = Number(errors);
    const warningCount = Number(warnings);
    return {
      kind: "scan",
      repo,
      branch,
      summary: {
        errors: errorCount,
        warnings: warningCount,
        infos: Math.max(0, total - errorCount - warningCount),
        totalFindings: total,
      },
    };
  }

  if (title === "Deployment succeeded") {
    const match = message.match(DEPLOY_MESSAGE_RE);
    if (!match) return null;
    const [, repo, branch, appUrl] = match;
    return {
      kind: "deploy",
      repo,
      branch,
      appUrl: appUrl || undefined,
    };
  }

  return null;
}

export function resolveNotificationMetadata(notification: Notification): NotificationMetadata | null {
  if (notification.metadata) return notification.metadata;
  return parseNotificationMessage(notification.title, notification.message);
}

export function getNotificationDetailPath(notification: Notification): string | null {
  const metadata = resolveNotificationMetadata(notification);
  if (!metadata) return null;

  if (metadata.kind === "deploy") {
    return metadata.deployId ? `/deploy/${metadata.deployId}` : "/deploy";
  }

  if (metadata.scanId) return `/security/${metadata.scanId}`;
  if (metadata.projectId) return `/security/project/${metadata.projectId}`;
  return "/security";
}
