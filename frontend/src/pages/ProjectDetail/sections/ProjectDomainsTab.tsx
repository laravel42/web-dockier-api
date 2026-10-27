import { useState, useEffect, useCallback, useId, useRef } from "react";
import { domainsApi, type DnsInstructions } from "@/services/domains";
import type { Domain, SslCertificate } from "@/types";
import type { Project } from "@/types";
import { usePermissions } from "@/context/PermissionsContext";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";
import { ApiError } from "@/services/api-error";
import DomainAttachment from "./DomainAttachment";
import Modal from "@/components/Modal";
import Spinner from "@/components/Spinner";
import Button from "@/components/ui/Button";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import ConfirmModal from "@/components/ConfirmModal";
import Alert from "@/components/ui/Alert";
import { Input } from "@/components/ui/input";
import { CircleCheckIcon, CopyIcon, EllipsisVerticalIcon, ExternalLinkIcon, HashIcon, InfoIcon, PlusIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import { settingsBadgeCls } from "@/utils/styles";
import { TabPanelHeader } from "@/components/TabPanelHeader";
import { useMenuKeyboard } from "@/hooks/useMenuKeyboard";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import DropdownPortal from "@/components/DropdownPortal";
import { dnsBannerCopy } from "@/utils/dnsBannerCopy";
import TabSpinner from "@/components/ui/TabSpinner";

interface Props {
  project: Project;
  /** Bumps after an in-session deploy; shown-after-deploy trigger for the DNS banner. */
  domainRefreshKey?: number;
}

// Fixed width of the portaled actions menu (matches the legacy `w-40` = 10rem).
const MENU_WIDTH = 160;
// Rough height used only to decide whether to flip the menu above the trigger.
const MENU_EST_HEIGHT = 180;
// Keep the menu this far from the viewport edges when clamping/flipping.
const VIEWPORT_MARGIN = 8;


// ─── Domain Row ───

function DomainRow({
  domain,
  projectId,
  canManage,
  infraLive,
  onRefresh,
}: {
  domain: Domain;
  projectId: string;
  canManage: boolean;
  infraLive: boolean;
  onRefresh: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const { menuRef, onKeyDown: onMenuKeyDown } = useMenuKeyboard(menuOpen, closeMenu);
  const { copy } = useCopyToClipboard();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [dnsStatus, setDnsStatus] = useState<{ verified: boolean; message: string } | null>(null);
  const [instructions, setInstructions] = useState<DnsInstructions | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [instructionsError, setInstructionsError] = useState("");

  // Fetched on demand rather than with the list: the records come from the live
  // CDN and certificate, so one request per domain only when a user asks.
  const handleToggleInstructions = async () => {
    setMenuOpen(false);
    if (instructionsOpen) {
      setInstructionsOpen(false);
      return;
    }
    setInstructionsOpen(true);
    if (instructions) return;

    setInstructionsError("");
    try {
      setInstructions(await domainsApi.dnsInstructions(projectId, domain.id));
    } catch (err: unknown) {
      setInstructionsError((err as Error).message || "Could not load DNS records");
    }
  };

  // Errors propagate so ConfirmModal can surface them in place; a toast behind a
  // closing modal is how a failed delete became invisible.
  const handleDelete = async () => {
    await domainsApi.deleteDomain(projectId, domain.id);
    onRefresh();
    setMenuOpen(false);
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
    void copy(domain.name);
    setMenuOpen(false);
  };

  const handleCopyId = () => {
    void copy(domain.id);
    setMenuOpen(false);
  };

  const handleVisit = () => {
    window.open(`https://${domain.name}`, "_blank", "noopener");
    setMenuOpen(false);
  };

  return (
    <>
    <div className="px-4 py-3 space-y-2">
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
                {/* Mouse-only dismissal; Escape closes this surface as well. */}
                <div aria-hidden="true" className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div
                  ref={menuRef}
                  onKeyDown={onMenuKeyDown}
                  role="menu"
                  tabIndex={-1}
                  aria-label="Domain actions"
                  className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-surface shadow-(--shadow-overlay) py-1"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleVisit}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-card/60 transition-colors"
                  >
                    <ExternalLinkIcon className="size-3.5" />
                    Visit
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleCopy}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-card/60 transition-colors"
                  >
                    <CopyIcon className="size-3.5" />
                    Copy
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleCopyId}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-card/60 transition-colors"
                  >
                    <HashIcon className="size-3.5" />
                    Copy ID
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleVerifyDns}
                    disabled={verifying || !infraLive}
                    title={!infraLive ? "Deploy the project first" : undefined}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-card/60 transition-colors disabled:opacity-50"
                  >
                    <CircleCheckIcon className="size-3.5" />
                    {verifying ? "Verifying…" : "Verify DNS"}
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleInstructions}
                    disabled={!infraLive}
                    title={!infraLive ? "Deploy the project first" : undefined}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-muted transition-colors hover:bg-card/60 hover:text-text disabled:opacity-50"
                  >
                    {instructionsOpen ? "Hide DNS records" : "Show DNS records"}
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setConfirmOpen(true); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-danger-500 hover:bg-danger-500/5 transition-colors"
                  >
                    <Trash2Icon className="size-3.5" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
    {dnsStatus && (
      <div className={`mx-2 mb-2 rounded-md px-3 py-2 text-xs ${
        dnsStatus.verified
          ? "bg-success-500/10 text-success-500 border border-success-500/30"
          : "bg-warning-surface text-warning-ink border border-warning-line"
      }`}>
        {dnsStatus.message}
      </div>
    )}
    {instructionsOpen && (
      <div className="mx-2 mb-2 rounded-md border border-border bg-card/40 p-3 ">
        {instructionsError ? (
          <p className="text-xs text-danger-300">{instructionsError}</p>
        ) : !instructions ? (
          <p className="text-xs text-text-muted">Loading DNS records…</p>
        ) : !instructions.supported ? (
          <p className="text-xs text-text-muted">{instructions.message}</p>
        ) : (
          <>
            <p className="mb-2 text-xs font-medium text-text">
              Add these records at your DNS provider
            </p>
            <div className="space-y-2">
              {instructions.records.map((record) => (
                <div
                  key={`${record.type}-${record.name}`}
                  className="rounded border border-border bg-bg/40 px-2.5 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={settingsBadgeCls.muted}>{record.type}</span>
                        <span className="truncate font-mono text-xs text-text">{record.name}</span>
                      </div>
                      <p className="mt-1 break-all font-mono text-xs text-text-muted">
                        {record.value}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">{record.purpose}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copy(record.value)}
                      className="shrink-0 rounded border border-border px-2 py-1 text-xs text-text-muted transition-colors hover:bg-card/60 hover:text-text"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-text-muted">{instructions.note}</p>
          </>
        )}
      </div>
    )}
    </div>

    <ConfirmModal
      open={confirmOpen}
      onClose={() => setConfirmOpen(false)}
      onConfirm={handleDelete}
      title="Delete domain"
      message={`Delete ${domain.name}? Traffic to this domain stops immediately. You can add it back, but DNS will need to propagate again.`}
      confirmLabel="Delete domain"
    />
    </>
  );
}

// ─── Domains Section ───

function DomainsSection({
  projectId,
  domains,
  canManage,
  infraLive,
  onRefresh,
}: {
  projectId: string;
  domains: Domain[];
  canManage: boolean;
  infraLive: boolean;
  onRefresh: () => void;
}) {
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  /**
   * Shown only after the backend refuses an apex domain with
   * `code: "apex_requires_ack"`. Error-driven rather than predicted, because
   * the frontend cannot reliably tell an apex from a subdomain (two-label
   * public suffixes like `example.co.uk`) and cannot know the cloud at all.
   */
  const [showApexAck, setShowApexAck] = useState(false);
  const [apexAck, setApexAck] = useState(false);
  /** A heads-up that the hostname already resolves elsewhere. Dismissible. */
  const [advisory, setAdvisory] = useState("");
  const errorId = useId();
  const toast = useToast();

  const primaryDomain = domains.find((d) => d.isPrimary);
  const wildcard = primaryDomain?.wildcard ?? false;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setAdding(true);
    setError("");
    try {
      const created = await domainsApi.createDomain(projectId, {
        name: newDomain.trim(),
        ...(apexAck ? { apexAliasAck: true } : {}),
      });
      setNewDomain("");
      setShowApexAck(false);
      setApexAck(false);
      setAdvisory(created.warning ?? "");
      onRefresh();
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to add domain");
      // Keep the typed name in the field so the user only has to tick the box
      // and resubmit, rather than retyping the domain.
      if (err instanceof ApiError && err.code === "apex_requires_ack") {
        setShowApexAck(true);
      }
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

      {!infraLive && domains.length === 0 && (
        <Alert variant="warning" className="m-4 mb-0">
          Add domains now — they activate automatically the next time you deploy.
          DNS setup and HTTPS can't be verified until your app is running.
        </Alert>
      )}

      {/* Add domain form */}
      {canManage && (
        <form onSubmit={handleAdd} className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              className="flex-1"
              placeholder="your-domain.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              disabled={adding}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={adding || !newDomain.trim()}
              loading={adding}
            >
              {adding ? "Adding…" : "Add domain"}
            </Button>
          </div>

          {error && (
            <p id={errorId} role="alert" className="mt-2 text-xs text-danger-500">
              {error}
            </p>
          )}

          {showApexAck && (
            <label className="mt-2 flex items-start gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={apexAck}
                onChange={(e) => setApexAck(e.target.checked)}
                /* Focused on purpose: the box appears in response to the
                   user's own submit and is the only thing that resolves the
                   refusal rendered directly above it. */
                autoFocus
              />
              <span>
                My DNS provider supports ALIAS, ANAME, or CNAME flattening at the domain root.
              </span>
            </label>
          )}
        </form>
      )}

      {advisory && (
        <div className="flex items-start gap-2 border-b border-warning-line bg-warning-surface px-4 py-2 text-xs text-warning-ink">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p className="flex-1">{advisory}</p>
          <button
            type="button"
            onClick={() => setAdvisory("")}
            className="shrink-0 underline"
            aria-label="Dismiss this notice"
          >
            Dismiss
          </button>
        </div>
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
              infraLive={infraLive}
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { copy } = useCopyToClipboard();

  // The actions menu renders in a body portal (fixed position) so a parent's
  // `overflow` cannot clip it. Track the trigger and compute a right-aligned,
  // flip-up position for it.
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateMenuPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(VIEWPORT_MARGIN, rect.right - MENU_WIDTH);
    const flipUp = rect.bottom + MENU_EST_HEIGHT > window.innerHeight - VIEWPORT_MARGIN;
    const top = flipUp ? rect.top - MENU_EST_HEIGHT - 4 : rect.bottom + 4;
    setMenuPos({ top, left, width: MENU_WIDTH });
  }, []);

  const closeMenu = useCallback(() => { setMenuOpen(false); setMenuPos(null); }, []);
  const { menuRef, onKeyDown: onMenuKeyDown } = useMenuKeyboard(menuOpen, closeMenu);

  const toggleMenu = useCallback(() => {
    setMenuOpen((open) => {
      if (open) { setMenuPos(null); return false; }
      updateMenuPos();
      return true;
    });
  }, [updateMenuPos]);

  // Recalculate on scroll/resize so the portaled menu tracks its trigger.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = () => updateMenuPos();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [menuOpen, updateMenuPos]);

  const typeLabels: Record<SslCertificate["type"], string> = {
    lets_encrypt: "Let's Encrypt",
    custom: "Custom",
    clone: "Clone",
    // Provider-issued, for static (CDN) deployments.
    acm: "AWS Certificate Manager",
    gcp_managed: "Google-managed",
  };

  const statusColors: Record<SslCertificate["status"], string> = {
    active: settingsBadgeCls.success,
    pending: settingsBadgeCls.warning,
    expired: "inline-flex items-center rounded border border-danger-500/45 bg-danger-500/30 px-2 py-0.5 text-xs font-medium text-danger-300",
    failed: "inline-flex items-center rounded border border-danger-500/45 bg-danger-500/30 px-2 py-0.5 text-xs font-medium text-danger-300",
  };

  const statusDotColors: Record<SslCertificate["status"], string> = {
    active: "bg-success-500",
    pending: "animate-pulse bg-warning-ink",
    expired: "bg-danger-500",
    failed: "bg-danger-500",
  };

  const handleDelete = async () => {
    await domainsApi.deleteCertificate(projectId, cert.id);
    onRefresh();
    closeMenu();
  };

  const expiresLabel = cert.expiresAt
    ? formatExpiry(cert.expiresAt)
    : null;

  return (
    <>
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
              ref={triggerRef}
              type="button"
              onClick={toggleMenu}
              className="flex size-7 items-center justify-center rounded-md border border-border text-text-muted hover:text-text hover:bg-card/60 transition-colors"
              aria-label="Certificate actions"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <EllipsisVerticalIcon className="size-4" />
            </button>
            {menuOpen && (
              <>
                {/* Mouse-only dismissal; Escape closes this surface as well. */}
                <div aria-hidden="true" className="fixed inset-0 z-99998" onClick={closeMenu} />
                <DropdownPortal
                  open={menuOpen}
                  pos={menuPos}
                  dropdownRef={menuRef}
                  className="w-40 rounded-lg border border-border bg-surface shadow-(--shadow-overlay) py-1"
                >
                  <div onKeyDown={onMenuKeyDown} role="menu" tabIndex={-1} aria-label="Certificate actions">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { void copy(cert.id); closeMenu(); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text hover:bg-card/60 transition-colors"
                    >
                      <HashIcon className="size-3.5" />
                      Copy ID
                    </button>
                    <div className="my-1 border-t border-border" />
                    <button
                      type="button"
                      onClick={() => { closeMenu(); setConfirmOpen(true); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-danger-500 hover:bg-danger-500/5 transition-colors"
                    >
                      <Trash2Icon className="size-3.5" />
                      Delete
                    </button>
                  </div>
                </DropdownPortal>
              </>
            )}
          </div>
        )}
      </div>
    </div>

    <ConfirmModal
      open={confirmOpen}
      onClose={() => setConfirmOpen(false)}
      onConfirm={handleDelete}
      title="Delete SSL certificate"
      message={`Delete the certificate for ${cert.domainName}? HTTPS stops working for the domains it covers until a new certificate is issued.`}
      confirmLabel="Delete certificate"
    />
    </>
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

/**
 * The certificate types a client may request.
 *
 * `acm` and `gcp_managed` are deliberately excluded: they are issued and
 * renewed by the cloud provider for static (CDN) deployments, so there is
 * nothing to create by hand.
 */
type ClientCertificateType = "lets_encrypt" | "custom" | "clone";

function CreateCertificateModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const fid = useId();
  const [type, setType] = useState<ClientCertificateType>("lets_encrypt");
  const [domainName, setDomainName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const typeOptions: Array<{ value: ClientCertificateType; label: string; description: string }> = [
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
          <label className="mb-1 block text-xs font-medium text-text-muted" htmlFor={`${fid}-domain`}>Domain</label>
          <Input id={`${fid}-domain`}
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
    <Modal open onClose={onClose} title="Proxy configuration">
      <p className="text-xs text-text-muted mb-4">
        A read-only preview of the generated reverse-proxy configuration for your domains and certificates.
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
          <p className="mt-3 text-xs text-warning-ink flex items-center gap-1.5">
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

export default function ProjectDomainsTab({ project, domainRefreshKey }: Props) {
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
  /** True once the staged attachment card is showing, so the old bar stands down. */
  const [stagedViewActive, setStagedViewActive] = useState(false);

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

  // Reload resets domainRefreshKey to 0 → deployedThisSession is false (banner hidden);
  // an in-session deploy bumps it above the captured initial → banner shows.
  const initialKey = useRef(domainRefreshKey ?? 0);

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

  const dnsBanner = dnsBannerCopy(project.infraState, domains.length > 0);
  const deployedThisSession = (domainRefreshKey ?? 0) > initialKey.current;

  return (
    <div className="space-y-6 overflow-y-auto pr-1">
      {/* Header with actions */}
      <div className="flex items-start justify-between gap-4">
        <TabPanelHeader
          title="Domains"
          description="Manage your site's domains and SSL certificates."
          linkText="Learn more"
          linkHref="https://docs.dockier.dev/domains"
        />
        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowNginxModal(true)}
              iconLeft={<SquarePenIcon className="size-3.5" />}
            >
              View proxy configuration
            </Button>
          </div>
        )}
      </div>

      {deployedThisSession && dnsBanner.show && (
        <Alert variant="warning">{dnsBanner.text}</Alert>
      )}

      <DomainAttachment
        projectId={project.id}
        canManage={canManage}
        onRefresh={fetchData}
        onSupportedChange={setStagedViewActive}
      />

      {/* Sync status bar — kept unchanged for the branches with no staged view
          (Dokploy, legacy VPS), where it is still the only progress surface. */}
      {!stagedViewActive && (domains.length > 0 || certificates.length > 0) && canManage && (
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
        infraLive={project.infraState === "live"}
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
