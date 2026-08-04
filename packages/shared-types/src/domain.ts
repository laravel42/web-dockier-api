export type SslCertificateType = "lets_encrypt" | "custom" | "clone";
export type SslCertificateStatus = "pending" | "active" | "expired" | "failed";

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
  createdAt: string;
  updatedAt: string;
}
