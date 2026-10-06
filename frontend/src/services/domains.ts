import { request } from "./request";
import type { Domain, SslCertificate } from "../types";

export interface DnsRecordInstruction {
  name: string;
  type: string;
  value: string;
  purpose: string;
}

export interface DnsInstructions {
  /** false when this deployment type has no specific records to publish. */
  supported: boolean;
  domainName?: string;
  records: DnsRecordInstruction[];
  note: string;
  message?: string;
}

export const domainsApi = {
  // Domains
  listDomains: (projectId: string) =>
    request<{ domains: Domain[] }>(
      `/projects/${encodeURIComponent(projectId)}/domains`,
    ),

  createDomain: (
    projectId: string,
    data: {
      name: string;
      /**
       * Confirms the user's DNS provider supports ALIAS, ANAME or CNAME
       * flattening at a zone root. Only meaningful for an apex domain on AWS.
       */
      apexAliasAck?: boolean;
    },
  ) =>
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

  // The DNS records the user must publish. Static (CDN) deployments need a
  // CNAME to the distribution plus a certificate-validation record, neither of
  // which the user can guess.
  dnsInstructions: (projectId: string, domainId: string) =>
    request<DnsInstructions>(
      `/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domainId)}/dns-instructions`,
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
