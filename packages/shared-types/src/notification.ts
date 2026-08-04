export type NotificationDeployMetadata = {
  kind: "deploy";
  repo: string;
  branch: string;
  commit?: string;
  appUrl?: string;
  deployId?: string;
};

export type NotificationScanMetadata = {
  kind: "scan";
  repo: string;
  branch: string;
  commit?: string;
  projectId?: string;
  scanId?: string;
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    totalFindings?: number;
  };
};

export type NotificationMetadata = NotificationDeployMetadata | NotificationScanMetadata;

export interface Notification {
  id: string;
  title: string;
  message: string;
  metadata?: NotificationMetadata | null;
  read: boolean;
  createdAt: string;
}
