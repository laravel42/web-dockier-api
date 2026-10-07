/**
 * `acm` and `gcp_managed` are issued and renewed by the cloud provider for
 * static-hosting deployments; a client never requests them.
 */
export type SslCertificateType = "lets_encrypt" | "custom" | "clone" | "acm" | "gcp_managed";
export type SslCertificateStatus = "pending" | "active" | "expired" | "failed";

/**
 * Where a certificate is in its provider handshake. Distinct from
 * `SslCertificateStatus`, which answers "is there a usable certificate"; this
 * answers "what is the user waiting for, and is it their turn to act".
 */
export type CertVerificationState =
  | "pending"
  | "awaiting_dns"
  | "provisioning"
  | "attaching"
  | "live"
  | "failed"
  | "timed_out";

/** A DNS record the user must publish. */
export interface DnsValidationRecord {
  name: string;
  type: string;
  value: string;
}

export interface Domain {
  id: string;
  projectId: string;
  name: string;
  isPrimary: boolean;
  redirectWww: boolean;
  wildcard: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * Advisory returned only when creating a domain that already resolves
   * somewhere other than this project's CDN. Never present on a list.
   */
  warning?: string;
}

export interface SslCertificate {
  id: string;
  projectId: string;
  domainId: string | null;
  type: SslCertificateType;
  status: SslCertificateStatus;
  domainName: string;
  expiresAt: string | null;
  issuedAt: string | null;
  /** ACM certificate ARN, or a GCP sslCertificates self-link. */
  providerRef?: string | null;
  /** For ACM: the CNAME the user must publish. Null for GCP-managed. */
  validationRecord?: DnsValidationRecord | null;
  verificationState?: CertVerificationState;
  verificationMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Who the next move in an attachment belongs to. */
export type StageOwner = "you" | "dockier" | "aws" | "google";
export type StageStatus = "done" | "current" | "pending" | "failed";

export interface AttachmentStage {
  id: string;
  label: string;
  /** Absent on a terminal "serving" stage, which is nobody's action. */
  owner?: StageOwner;
  status: StageStatus;
  detail?: string;
  /** A realistic wait. No stage is presented as instantaneous. */
  eta?: string;
}

export interface DomainAttachmentRecord {
  name: string;
  type: string;
  value: string;
  purpose: string;
}

export interface DomainAttachmentEntry {
  domainId: string;
  domainName: string;
  verificationState: CertVerificationState;
  stages: AttachmentStage[];
  records: DomainAttachmentRecord[];
  note: string;
  resumable: boolean;
}

export interface DomainAttachment {
  /** `false` for the Dokploy and legacy VPS branches. */
  supported: boolean;
  cloud?: "aws" | "gcp";
  /** An actionable reason the attachment cannot progress at all. */
  blocker?: string;
  domains: DomainAttachmentEntry[];
}
