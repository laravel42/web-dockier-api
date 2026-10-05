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
