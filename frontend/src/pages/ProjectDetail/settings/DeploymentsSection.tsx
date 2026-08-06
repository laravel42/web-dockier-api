import { useState } from "react";
import { projectsApi } from "@/services/projects";
import type { Project } from "@/types";
import Button from "@/components/ui/Button";
import { getDefaultDeployScript } from "@/config/frameworks";
import { SectionTitle, SettingsRow, ToggleSwitch, CopyableField } from "./shared";

interface Props {
  project: Project;
  canManage: boolean;
  onProjectUpdate?: (project: Project) => void;
}

export default function DeploymentsSection({ project, canManage, onProjectUpdate }: Props) {
  const [pushToDeploy, setPushToDeploy] = useState(
    (project.settings?.pushToDeploy as boolean) ?? false,
  );
  const [healthChecks, setHealthChecks] = useState(false);
  const [envInScript, setEnvInScript] = useState(false);
  const [deployScript, setDeployScript] = useState(
    project.settings?.deployScript as string ?? getDefaultDeployScript(project.platform ?? "other"),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const originalScript = project.settings?.deployScript as string ?? getDefaultDeployScript(project.platform ?? "other");
  const hasScriptChanges = deployScript !== originalScript;

  const handleTogglePushToDeploy = async (enabled: boolean) => {
    setPushToDeploy(enabled);
    try {
      const updated = await projectsApi.update(project.id, { settings: { pushToDeploy: enabled } });
      onProjectUpdate?.(updated);
    } catch {
      setPushToDeploy(!enabled);
    }
  };

  const handleSaveScript = async () => {
    setSaving(true);
    try {
      const updated = await projectsApi.update(project.id, { settings: { deployScript } });
      onProjectUpdate?.(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const deployHookUrl = `https://dockier.dev/api/projects/${project.id}/deploy/hook?token=${project.id.slice(0, 8)}`;

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Deployments"
        description="Manage build and deployment settings."
      />

      {/* Push to deploy */}
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <SettingsRow label="Push to deploy" description="Automatically trigger a new deployment when changes are pushed to the environment's Git branch.">
          <ToggleSwitch checked={pushToDeploy} onChange={handleTogglePushToDeploy} disabled={!canManage} />
        </SettingsRow>
        {pushToDeploy && (
          <div className="border-t border-border px-4 py-3">
            <p className="text-xs text-text-muted mb-1">Deploy Hook URL</p>
            <code className="text-[11px] text-text-muted font-mono break-all select-all bg-secondary-50 px-2 py-1 rounded border border-border">
              {deployHookUrl}
            </code>
            <p className="text-[10px] text-text-muted mt-1.5">
              Add this URL as a webhook in your Git provider, or use the HMAC-signed endpoint at <code className="text-[10px]">/deploy/webhook/git-push</code> for production setups.
            </p>
          </div>
        )}
      </div>

      {/* Deploy script */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">Deploy script</p>
          <p className="text-xs text-text-muted mt-0.5">
            Commands that run inside the container after deployment. These execute after the container starts and is healthy.
          </p>
        </div>

        <div className="relative rounded-md border border-border bg-background overflow-hidden">
          <div className="flex">
            <div className="flex flex-col items-end p-2 select-none border-r border-border/50 bg-card/60">
              {deployScript.split("\n").map((_, i) => (
                <span key={i} className="text-[11px]/5 text-text-muted/50 font-mono">
                  {i + 1}
                </span>
              ))}
            </div>
            <textarea
              value={deployScript}
              onChange={(e) => setDeployScript(e.target.value)}
              disabled={!canManage}
              rows={deployScript.split("\n").length}
              className="flex-1 bg-transparent px-3 py-2 font-mono text-[12px]/5 text-text outline-none resize-none placeholder:text-text-muted"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={envInScript}
              onChange={(e) => setEnvInScript(e.target.checked)}
              disabled={!canManage}
              className="size-3.5 rounded border-border accent-primary-500"
            />
            <span className="text-xs text-text-muted">
              Make <code className="rounded border border-border/50 bg-background px-1 py-0.5 text-[10px] font-mono">.env</code> variables available to deployment script
            </span>
          </label>
          {canManage && hasScriptChanges && (
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setDeployScript(originalScript)}>
                Reset
              </Button>
              <Button variant="primary" size="sm" onClick={() => void handleSaveScript()} loading={saving}>
                Save
              </Button>
              {saved && <span className="text-xs text-success-500 font-medium">Saved</span>}
            </div>
          )}
        </div>
      </div>

      {/* Deploy hook */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">Deploy hook</p>
          <p className="text-xs text-text-muted mt-0.5">
            To deploy your app using a CI service, simply configure it to make a GET or POST request to the URL below after code commits or successful tests.
          </p>
        </div>
        <CopyableField value={deployHookUrl} />
      </div>

      {/* Health checks */}
      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <SettingsRow
          label="Health checks"
          description="After deploying, Dockier will ping a URL in your application to ensure it is still available."
          border={false}
        >
          <ToggleSwitch checked={healthChecks} onChange={setHealthChecks} disabled={!canManage} />
        </SettingsRow>
      </div>

      {/* Keys */}
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">Keys</p>
          <p className="text-xs text-text-muted mt-0.5">Your project's public SSH keys.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">Site public key</label>
          <p className="text-xs text-text-muted mb-2">
            Typically, this key will automatically be added to GitHub, GitLab. However, if you need to add it to a source control service manually, you may copy it from here.
          </p>
          <CopyableField value={`ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... dockier@${project.name}`} />
        </div>
      </div>
    </div>
  );
}
