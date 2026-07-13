import { useState, useEffect, useCallback } from "react";
import { domainsApi } from "../../../services/domains";
import type { Domain, SslCertificate } from "../../../services/domains";
import type { Project } from "../../../types";
import { usePermissions } from "../../../context/PermissionsContext";
import Modal from "../../../components/Modal";
import Spinner from "../../../components/Spinner";
import { btnPrimary, btnOutline, inputCls } from "../../../utils/styles";

interface Props {
  project: Project;
}

function TabSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10">
      <Spinner className="size-4" />
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}

// ─── Domain Row ───

function DomainRow({
  domain,
  projectId,
  canManage,
  onRefresh,
}: {
  domain: Domain;
  projectId: string;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [dnsStatus, setDnsStatus] = useState<{ verified: boolean; message: string } | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await domainsApi.deleteDomain(projectId, domain.id);
      onRefresh();
    } catch { /* silent */ }
    finally { setDeleting(false); setMenuOpen(false); }
  };

  const handleVerifyDns = async () => {
    setVerifying(true);
    setDnsStatus(null);
    try {
      const result = await domainsApi.verifyDns(projectId, domain.id);
      setDnsStatus(result);
    } catch (err: unknown) {
      setDnsStatus({ verified: false, message: (err as Error).message || "Verification failed" });
    } finally {
      setVerifying(false);
      setMenuOpen(false);
    }
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(domain.name);
    setMenuOpen(false);
  };

  const handleCopyId = () => {
    void navigator.clipboard.writeText(domain.id);
    setMenuOpen(false);
  };

  const handleVisit = () => {
    window.open(`https://${domain.name}`, "_blank", "noopener");
    setMenuOpen(false);
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text">{domain.name}</span>
          {domain.isPrimary && (
            <span className="rounded-full border border-border bg-secondary-50/50 px-2 py-0.5 text-[10px] font-medium text-text-muted">
              Primary
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {domain.redirectWww && (
            <span className="text-xs text-text-muted">Redirect from www.</span>
          )}
          {canManage && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex size-7 items-center justify-center rounded-md border border-border text-text-muted hover:text-text hover:bg-secondary-50/50 transition-colors"
                aria-label="Domain actions"
              >
                <svg className="size-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-surface shadow-lg py-1">
                  <button
                    type="button"
                    onClick={handleVisit}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-secondary-50/50 transition-colors"
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    Visit
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-secondary-50/50 transition-colors"
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                    </svg>
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-secondary-50/50 transition-colors"
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" />
                    </svg>
                    Copy ID
                  </button>
                  <button
                    type="button"
                    onClick={handleVerifyDns}
                    disabled={verifying}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-secondary-50/50 transition-colors disabled:opacity-50"
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {verifying ? "Verifying…" : "Verify DNS"}
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-danger-500 hover:bg-danger-500/5 transition-colors disabled:opacity-50"
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
    {dnsStatus && (
      <div className={`mx-4 mb-2 rounded-md px-3 py-2 text-xs ${
        dnsStatus.verified
          ? "bg-success-500/10 text-success-500 border border-success-500/30"
          : "bg-amber-500/10 text-amber-500 border border-amber-500/30"
      }`}>
        {dnsStatus.message}
      </div>
    )}
  </div>
  );
}

// ─── Domains Section ───

function DomainsSection({
  projectId,
  domains,
  canManage,
  onRefresh,
}: {
  projectId: string;
  domains: Domain[];
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const primaryDomain = domains.find((d) => d.isPrimary);
  const wildcard = primaryDomain?.wildcard ?? false;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setAdding(true);
    setError("");
    try {
      await domainsApi.createDomain(projectId, { name: newDomain.trim() });
      setNewDomain("");
      onRefresh();
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to add domain");
    } finally {
      setAdding(false);
    }
  };

  const handleToggleWildcard = async () => {
    if (!primaryDomain) return;
    try {
      await domainsApi.updateDomain(projectId, primaryDomain.id, {
        wildcard: !wildcard,
      });
      onRefresh();
    } catch { /* silent */ }
  };

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-text">Custom domains</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Add custom domains and aliases that you own.
          </p>
        </div>
      </div>

      {/* Add domain form */}
      {canManage && (
        <form onSubmit={handleAdd} className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <input
            type="text"
            className={`${inputCls} flex-1`}
            placeholder="your-domain.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            disabled={adding}
          />
          <button
            type="submit"
            className={btnOutline}
            disabled={adding || !newDomain.trim()}
          >
            {adding ? "Adding…" : "Add domain"}
          </button>
        </form>
      )}

      {error && (
        <p className="px-4 py-2 text-xs text-danger-500">{error}</p>
      )}

      {/* Domain list */}
      {domains.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <p className="text-sm font-medium text-text">No custom domains</p>
          <p className="text-xs text-text-muted">
            Add a domain above to get started.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {domains.map((domain) => (
            <DomainRow
              key={domain.id}
              domain={domain}
              projectId={projectId}
              canManage={canManage}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}

      {/* Wildcard toggle */}
      {primaryDomain && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <div>
            <p className="text-sm font-medium text-text">Allow wildcard subdomains</p>
            <p className="text-xs text-text-muted mt-0.5">
              Allow all subdomains to accept traffic, e.g.{" "}
              <code className="rounded bg-secondary-50/80 px-1.5 py-0.5 text-[11px] font-mono text-text">
                *.{primaryDomain.name}
              </code>
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={handleToggleWildcard}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                wildcard ? "bg-primary-500" : "bg-border"
              }`}
              role="switch"
              aria-checked={wildcard}
              aria-label="Toggle wildcard subdomains"
            >
              <span
                className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  wildcard ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Certificate Row ───

function CertificateRow({
  cert,
  projectId,
  canManage,
  onRefresh,
}: {
  cert: SslCertificate;
  projectId: string;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const typeLabels: Record<SslCertificate["type"], string> = {
    lets_encrypt: "Let's Encrypt",
    custom: "Custom",
    clone: "Clone",
  };

  const statusColors: Record<SslCertificate["status"], string> = {
    active: "bg-success-500/10 text-success-500 border-success-500/30",
    pending: "bg-amber-500/10 text-amber-500 border-amber-500/30",
    expired: "bg-danger-500/10 text-danger-500 border-danger-500/30",
    failed: "bg-danger-500/10 text-danger-500 border-danger-500/30",
  };

  const statusDotColors: Record<SslCertificate["status"], string> = {
    active: "bg-success-500",
    pending: "animate-pulse bg-amber-500",
    expired: "bg-danger-500",
    failed: "bg-danger-500",
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await domainsApi.deleteCertificate(projectId, cert.id);
      onRefresh();
    } catch { /* silent */ }
    finally { setDeleting(false); setMenuOpen(false); }
  };

  const expiresLabel = cert.expiresAt
    ? formatExpiry(cert.expiresAt)
    : null;

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-text">{typeLabels[cert.type]}</span>
        <span className="text-xs text-text-muted">
          {cert.domainName}
          {expiresLabel && ` · ${expiresLabel}`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium capitalize ${statusColors[cert.status]}`}>
          <span className={`size-1.5 rounded-full ${statusDotColors[cert.status]}`} />
          {cert.status}
        </span>
        {canManage && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex size-7 items-center justify-center rounded-md border border-border text-text-muted hover:text-text hover:bg-secondary-50/50 transition-colors"
              aria-label="Certificate actions"
            >
              <svg className="size-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-border bg-surface shadow-lg py-1">
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard.writeText(cert.id); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-secondary-50/50 transition-colors"
                  >
                    Copy ID
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-danger-500 hover:bg-danger-500/5 transition-colors disabled:opacity-50"
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Certificates Section ───

function CertificatesSection({
  projectId,
  certificates,
  canManage,
  onRefresh,
}: {
  projectId: string;
  certificates: SslCertificate[];
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-text">Certificates</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Manage your site's SSL certificates.{" "}
            <a
              href="https://letsencrypt.org/docs/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-500 hover:text-primary-400 transition-colors"
            >
              Learn more
            </a>
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            className={btnOutline}
            onClick={() => setShowCreateModal(true)}
          >
            + Add certificate
          </button>
        )}
      </div>

      {certificates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <p className="text-sm font-medium text-text">No certificates</p>
          <p className="text-xs text-text-muted">
            Add a certificate to secure your site with HTTPS.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {certificates.map((cert) => (
            <CertificateRow
              key={cert.id}
              cert={cert}
              projectId={projectId}
              canManage={canManage}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateCertificateModal
          projectId={projectId}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Create Certificate Modal ───

function CreateCertificateModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<SslCertificate["type"]>("lets_encrypt");
  const [domainName, setDomainName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const typeOptions: Array<{ value: SslCertificate["type"]; label: string; description: string }> = [
    { value: "lets_encrypt", label: "Let's Encrypt", description: "Free automated certificate" },
    { value: "custom", label: "Existing certificate", description: "Upload your own certificate" },
    { value: "clone", label: "Clone certificate", description: "Clone from another site" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainName.trim()) return;
    setSaving(true);
    setError("");
    try {
      await domainsApi.createCertificate(projectId, {
        type,
        domainName: domainName.trim(),
      });
      onCreated();
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to create certificate");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New SSL certificate">
      <p className="text-xs text-text-muted mb-4">Add a certificate to your site.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-border divide-y divide-border">
          {typeOptions.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-secondary-50/50 transition-colors"
            >
              <input
                type="radio"
                name="cert-type"
                value={opt.value}
                checked={type === opt.value}
                onChange={() => setType(opt.value)}
                className="accent-primary-500"
              />
              <div>
                <span className="text-sm font-medium text-text">{opt.label}</span>
                <span className="ml-2 text-xs text-text-muted">{opt.description}</span>
              </div>
            </label>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Domain</label>
          <input
            type="text"
            className={inputCls}
            placeholder="your-domain.com"
            value={domainName}
            onChange={(e) => setDomainName(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-xs text-danger-500">{error}</p>}

        <button
          type="submit"
          className={`${btnPrimary} w-full`}
          disabled={saving || !domainName.trim()}
        >
          {saving ? "Creating…" : "Continue"}
        </button>
      </form>
    </Modal>
  );
}

// ─── Nginx Config Modal ───

function NginxConfigModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    domainsApi.previewConfig(projectId)
      .then((res) => {
        if (cancelled) return;
        setConfig(res.generatedConfig || "# No configuration generated yet.\n# Add a domain and deploy your project first.");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError((err as Error).message || "Failed to load configuration");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <Modal open onClose={onClose} title="Edit Nginx configuration">
      <p className="text-xs text-text-muted mb-4">
        Updating the configuration will <strong className="text-text">require Nginx to be reloaded</strong>.
      </p>
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Spinner className="size-4" />
        </div>
      )}
      {error && <p className="text-xs text-danger-500 py-4">{error}</p>}
      {config !== null && !loading && (
        <>
          <div className="rounded-lg border border-border bg-[#1e1e2e] p-3 max-h-80 overflow-auto">
            <pre className="text-xs/relaxed font-mono text-text whitespace-pre-wrap">
              {config}
            </pre>
          </div>
          <p className="mt-3 text-[11px] text-amber-500 flex items-center gap-1.5">
            <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            This is the auto-generated config based on your domains. Changes are applied via Sync.
          </p>
        </>
      )}
    </Modal>
  );
}

// ─── Helpers ───

function formatExpiry(dateStr: string): string {
  const now = new Date();
  const expires = new Date(dateStr);
  if (isNaN(expires.getTime())) return "Invalid date";
  const diffMs = expires.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "Expired";
  if (diffDays === 0) return "Expires today";
  if (diffDays === 1) return "Expires tomorrow";
  if (diffDays <= 30) return `Expires in ${diffDays} days`;
  const months = Math.round(diffDays / 30);
  return `Expires in ${months} month${months > 1 ? "s" : ""}`;
}

// ─── Main Domains Tab ───

export default function ProjectDomainsTab({ project }: Props) {
  const { has, loading: permissionsLoading } = usePermissions();
  const canManage = has("project:manage");
  const canView = has("project:view");

  const [domains, setDomains] = useState<Domain[]>([]);
  const [certificates, setCertificates] = useState<SslCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNginxModal, setShowNginxModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success: boolean; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    if (!project.id || !canView) return;
    setLoading(true);
    setError("");
    try {
      const [domRes, certRes] = await Promise.all([
        domainsApi.listDomains(project.id),
        domainsApi.listCertificates(project.id),
      ]);
      setDomains(domRes.domains);
      setCertificates(certRes.certificates);
    } catch {
      setError("Failed to load domains and certificates");
    } finally {
      setLoading(false);
    }
  }, [project.id, canView]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await domainsApi.apply(project.id);
      setSyncStatus({ success: res.success, message: res.message });
    } catch (err: unknown) {
      setSyncStatus({ success: false, message: (err as Error).message || "Sync failed" });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (permissionsLoading) return;
    if (!canView) { setLoading(false); return; }
    void fetchData();
  }, [permissionsLoading, canView, fetchData]);

  if (permissionsLoading || loading) {
    return <TabSpinner label="Loading domains…" />;
  }

  if (!canView) {
    return (
      <p className="text-sm text-text-muted text-center py-8">
        You don't have permission to view domain settings.
      </p>
    );
  }

  if (error) {
    return <p className="text-sm text-danger-500 text-center py-8">{error}</p>;
  }

  return (
    <div className="space-y-6 overflow-y-auto pr-1">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">Domains</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Manage your site's domains and SSL certificates.{" "}
            <a
              href="https://docs.dockier.dev/domains"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-500 hover:text-primary-400 transition-colors"
            >
              Learn more
            </a>
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btnOutline}
              onClick={() => setShowNginxModal(true)}
            >
              <span className="flex items-center gap-1.5">
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                </svg>
                Edit Nginx configuration
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Sync status bar */}
      {(domains.length > 0 || certificates.length > 0) && canManage && (
        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            {syncStatus && (
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                syncStatus.success ? "text-success-500" : "text-danger-500"
              }`}>
                <span className={`size-2 rounded-full ${syncStatus.success ? "bg-success-500" : "bg-danger-500"}`} />
                {syncStatus.message}
              </span>
            )}
            {!syncStatus && (
              <span className="text-xs text-text-muted">
                Domain config is auto-applied when saved. Use Sync to force re-apply.
              </span>
            )}
          </div>
          <button
            type="button"
            className={btnOutline}
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? (
              <span className="flex items-center gap-1.5">
                <Spinner className="size-3" /> Syncing…
              </span>
            ) : (
              "Sync now"
            )}
          </button>
        </div>
      )}

      <DomainsSection
        projectId={project.id}
        domains={domains}
        canManage={canManage}
        onRefresh={fetchData}
      />

      <CertificatesSection
        projectId={project.id}
        certificates={certificates}
        canManage={canManage}
        onRefresh={fetchData}
      />

      {/* Nginx Configuration Modal */}
      {showNginxModal && (
        <NginxConfigModal
          projectId={project.id}
          onClose={() => setShowNginxModal(false)}
        />
      )}
    </div>
  );
}
