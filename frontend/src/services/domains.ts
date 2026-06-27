import { request } from "./request";

// ─── Types ───

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
  type: "lets_encrypt" | "custom" | "clone";
  status: "pending" | "active" | "expired" | "failed";
  domainName: string;
  expiresAt: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── API ───

export const domainsApi = {
  // Domains
  listDomains: (projectId: string) =>
    request<{ domains: Domain[] }>(
      `/projects/${encodeURIComponent(projectId)}/domains`,
    ),

  createDomain: (projectId: string, data: { name: string }) =>
    request<Domain>(
      `/projects/${encodeURIComponent(projectId)}/domains`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  updateDomain: (
    projectId: string,
    domainId: string,
    data: { isPrimary?: boolean; redirectWww?: boolean; wildcard?: boolean },
  ) =>
    request<Domain>(
      `/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domainId)}`,
      { method: "PATCH", body: JSON.stringify(data) },
    ),

  deleteDomain: (projectId: string, domainId: string) =>
    request(
      `/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domainId)}`,
      { method: "DELETE" },
    ),

  // Certificates
  listCertificates: (projectId: string) =>
    request<{ certificates: SslCertificate[] }>(
      `/projects/${encodeURIComponent(projectId)}/certificates`,
    ),

  createCertificate: (
    projectId: string,
    data: { type: "lets_encrypt" | "custom" | "clone"; domainName: string },
  ) =>
    request<SslCertificate>(
      `/projects/${encodeURIComponent(projectId)}/certificates`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  deleteCertificate: (projectId: string, certificateId: string) =>
    request(
      `/projects/${encodeURIComponent(projectId)}/certificates/${encodeURIComponent(certificateId)}`,
      { method: "DELETE" },
    ),

  // DNS Verification
  verifyDns: (projectId: string, domainId: string) =>
    request<{ verified: boolean; serverIp?: string; resolvedIp?: string; message: string }>(
      `/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domainId)}/verify-dns`,
      { method: "POST" },
    ),

  // Preview nginx config (read-only, no side effects)
  previewConfig: (projectId: string) =>
    request<{ generatedConfig: string }>(
      `/projects/${encodeURIComponent(projectId)}/domains/config-preview`,
    ),

  // Apply domain config to server
  apply: (projectId: string) =>
    request<{ success: boolean; message: string; generatedConfig?: string }>(
      `/projects/${encodeURIComponent(projectId)}/domains/apply`,
      { method: "POST" },
    ),
};
