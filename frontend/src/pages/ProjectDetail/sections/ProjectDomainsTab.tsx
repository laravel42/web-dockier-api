import { useState, useEffect, useCallback } from "react";
import { domainsApi } from "@/services/domains";
import type { Domain, SslCertificate } from "@/types";
import type { Project } from "@/types";
import { usePermissions } from "@/context/PermissionsContext";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";
import Modal from "@/components/Modal";
import Spinner from "@/components/Spinner";
import Button from "@/components/ui/Button";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import { Input } from "@/components/ui/input";
import { CircleCheckIcon, CopyIcon, EllipsisVerticalIcon, ExternalLinkIcon, HashIcon, InfoIcon, PlusIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import { settingsBadgeCls } from "@/utils/styles";

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
  const toast = useToast();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await domainsApi.deleteDomain(projectId, domain.id);
      onRefresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete domain"));
    } finally { setDeleting(false); setMenuOpen(false); }
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
            <span className={settingsBadgeCls.muted}>
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
                className="flex size-7 items-center justify-center rounded-md border border-border text-text-muted hover:text-text hover:bg-card/60 transition-colors"
                aria-label="Domain actions"
              >
                <EllipsisVerticalIcon className="size-4" />
              </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-surface shadow-(--shadow-overlay) py-1">
                  <button
                    type="button"
                    onClick={handleVisit}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-card/60 transition-colors"
                  >
                    <ExternalLinkIcon className="size-3.5" />
                    Visit
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-card/60 transition-colors"
                  >
                    <CopyIcon className="size-3.5" />
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-card/60 transition-colors"
                  >
                    <HashIcon className="size-3.5" />
                    Copy ID
                  </button>
                  <button
                    type="button"
                    onClick={handleVerifyDns}
                    disabled={verifying}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-card/60 transition-colors disabled:opacity-50"
                  >
                    <CircleCheckIcon className="size-3.5" />
                    {verifying ? "Verifying…" : "Verify DNS"}
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-danger-500 hover:bg-danger-500/5 transition-colors disabled:opacity-50"
                  >
                    <Trash2Icon className="size-3.5" />
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
  const toast = useToast();

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
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update wildcard setting"));
    }
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
          <Input
            type="text"
            className="flex-1"
            placeholder="your-domain.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            disabled={adding}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={adding || !newDomain.trim()}
            loading={adding}
          >
            {adding ? "Adding…" : "Add domain"}
          </Button>
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
              <code className="rounded border border-border/60 bg-secondary-50/30 px-1.5 py-0.5 text-xs font-mono text-text">
                *.{primaryDomain.name}
              </code>
            </p>
          </div>
          {canManage && (
            <ToggleSwitch
              checked={wildcard}
              onChange={handleToggleWildcard}
              ariaLabel="Toggle wildcard subdomains"
            />
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
  const toast = useToast();

  const typeLabels: Record<SslCertificate["type"], string> = {
    lets_encrypt: "Let's Encrypt",
    custom: "Custom",
    clone: "Clone",
  };

  const statusColors: Record<SslCertificate["status"], string> = {
    active: settingsBadgeCls.success,
    pending: settingsBadgeCls.warning,
    expired: "inline-flex items-center rounded border border-danger-500/45 bg-danger-500/30 px-2 py-0.5 text-xs font-medium text-danger-300",
    failed: "inline-flex items-center rounded border border-danger-500/45 bg-danger-500/30 px-2 py-0.5 text-xs font-medium text-danger-300",
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
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete certificate"));
    } finally { setDeleting(false); setMenuOpen(false); }
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
        <span className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-0.5 capitalize ${statusColors[cert.status]}`}>
          <span className={`size-1.5 rounded-full ${statusDotColors[cert.status]}`} />
          {cert.status}
        </span>
        {canManage && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex size-7 items-center justify-center rounded-md border border-border text-text-muted hover:text-text hover:bg-card/60 transition-colors"
              aria-label="Certificate actions"
            >
              <EllipsisVerticalIcon className="size-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-border bg-surface shadow-(--shadow-overlay) py-1">
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard.writeText(cert.id); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-card/60 transition-colors"
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
          <Button
            variant="outline"
            onClick={() => setShowCreateModal(true)}
            iconLeft={<PlusIcon className="size-3.5" />}
          >
            Add certificate
          </Button>
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
              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-card/60 transition-colors"
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
          <Input
            type="text"
            placeholder="your-domain.com"
            value={domainName}
            onChange={(e) => setDomainName(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-xs text-danger-500">{error}</p>}

        <Button
          type="submit"
          className="w-full"
          disabled={saving || !domainName.trim()}
          loading={saving}
        >
          {saving ? "Creating…" : "Continue"}
        </Button>
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
          <div className="rounded-lg border border-border bg-terminal p-3 max-h-80 overflow-auto">
            <pre className="text-xs/relaxed font-mono text-text whitespace-pre-wrap">
              {config}
            </pre>
          </div>
          <p className="mt-3 text-xs text-amber-500 flex items-center gap-1.5">
            <InfoIcon className="size-3.5 shrink-0" />
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
            <Button
              variant="outline"
              onClick={() => setShowNginxModal(true)}
              iconLeft={<SquarePenIcon className="size-3.5" />}
            >
              Edit Nginx configuration
            </Button>
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
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={syncing}
            loading={syncing}
          >
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
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
