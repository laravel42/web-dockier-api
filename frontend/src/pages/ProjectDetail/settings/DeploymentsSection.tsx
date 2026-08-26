import { useState } from "react";
import { projectsApi } from "@/services/projects";
import type { Project } from "@/types";
import { useSaveAction } from "@/hooks/useSaveAction";
import { useOptimisticToggle } from "@/hooks/useOptimisticToggle";
import Button from "@/components/ui/Button";
import CodeEditor from "@/components/CodeEditor";
import { getDefaultDeployScript } from "@/config/frameworks";
import { SectionTitle, SettingsRow, CopyableField } from "./shared";
import SettingsCard from "./SettingsCard";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import { Input } from "@/components/ui/input";

interface Props {
  project: Project;
  canManage: boolean;
  onProjectUpdate?: (project: Project) => void;
}

export default function DeploymentsSection({ project, canManage, onProjectUpdate }: Props) {
  const [pushToDeploy, togglePushToDeploy] = useOptimisticToggle(
    (project.settings?.pushToDeploy as boolean) ?? false,
    async (enabled) => {
      const updated = await projectsApi.update(project.id, { settings: { pushToDeploy: enabled } });
      onProjectUpdate?.(updated);
    },
    { errorFallback: "Failed to update push-to-deploy setting" },
  );
  const [deployScript, setDeployScript] = useState(
    project.settings?.deployScript as string ?? getDefaultDeployScript(project.platform ?? "other"),
  );

  const originalScript = project.settings?.deployScript as string ?? getDefaultDeployScript(project.platform ?? "other");
  const hasScriptChanges = deployScript !== originalScript;

  const { saving, saved, save: handleSaveScript } = useSaveAction(
    async () => {
      const updated = await projectsApi.update(project.id, { settings: { deployScript } });
      onProjectUpdate?.(updated);
    },
    { errorFallback: "Failed to save deploy script" },
  );

  const apiBase = import.meta.env.VITE_API_BASE || window.location.origin;
  const deployHookUrl = `${apiBase}/projects/${project.id}/deploy/hook?token=${project.id.slice(0, 8)}`;

  // Health checks
  const [healthCheckEnabled, toggleHealthCheck] = useOptimisticToggle(
    (project.settings?.healthCheckEnabled as boolean) ?? false,
    async (enabled) => {
      const updated = await projectsApi.update(project.id, { settings: { healthCheckEnabled: enabled } });
      onProjectUpdate?.(updated);
    },
    { errorFallback: "Failed to update health check setting" },
  );

  const [healthCheckUrl, setHealthCheckUrl] = useState(
    (project.settings?.healthCheckUrl as string) ?? "",
  );
  const originalHealthCheckUrl = (project.settings?.healthCheckUrl as string) ?? "";
  const hasHealthCheckUrlChanges = healthCheckUrl !== originalHealthCheckUrl;

  const { saving: savingHealthCheck, saved: savedHealthCheck, save: handleSaveHealthCheckUrl } = useSaveAction(
    async () => {
      const updated = await projectsApi.update(project.id, { settings: { healthCheckUrl } });
      onProjectUpdate?.(updated);
    },
    { errorFallback: "Failed to save health check URL" },
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Deploy"
        description="Manage build and deployment settings."
      />

      {/* Push to deploy */}
      <SettingsCard>
        <SettingsRow label="Push to deploy" description="Automatically trigger a new deployment when changes are pushed to the environment's Git branch.">
          <ToggleSwitch checked={pushToDeploy} onChange={togglePushToDeploy} disabled={!canManage} />
        </SettingsRow>
        {pushToDeploy && (
          <div className="border-t border-border px-4 py-3">
            <p className="text-xs text-text-muted mb-1">Deploy Hook URL</p>
            <code className="text-xs text-text-muted font-mono break-all select-all bg-secondary-50 px-2 py-1 rounded border border-border">
              {deployHookUrl}
            </code>
            <p className="text-xs text-text-muted mt-1.5">
              Add this URL as a webhook in your Git provider, or use the HMAC-signed endpoint at <code className="text-xs">/deploy/webhook/git-push</code> for production setups.
            </p>
          </div>
        )}
      </SettingsCard>

      {/* Deploy script */}
      <SettingsCard padded>
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">Deploy script</p>
          <p className="text-xs text-text-muted mt-0.5">
            Commands that run inside the container after deployment. These execute after the container starts and is healthy.
          </p>
        </div>

        <CodeEditor
          value={deployScript}
          onChange={setDeployScript}
          language="shell"
          readOnly={!canManage}
          height="auto"
        />

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-text-muted">
            <code className="rounded border border-border/50 bg-background px-1.5 py-0.5 text-xs font-mono">.env</code> variables are automatically available in your deployment script.
          </p>
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
      </SettingsCard>

      {/* Deploy hook */}
      <SettingsCard padded>
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">Deploy hook</p>
          <p className="text-xs text-text-muted mt-0.5">
            To deploy your app using a CI service, simply configure it to make a GET or POST request to the URL below after code commits or successful tests.
          </p>
        </div>
        <CopyableField value={deployHookUrl} />
      </SettingsCard>

      {/* Health checks */}
      <SettingsCard>
        <SettingsRow
          label="Health checks"
          description="After deploying, Dockier will ping a URL in your application to ensure it is still available."
          border={healthCheckEnabled}
        >
          <ToggleSwitch checked={healthCheckEnabled} onChange={toggleHealthCheck} disabled={!canManage} />
        </SettingsRow>
        {healthCheckEnabled && (
          <div className="border-t border-border px-4 py-3">
            <p className="text-xs font-medium text-text-muted mb-1.5">Health check URL</p>
            <p className="text-xs text-text-muted mb-2">
              The URL that will be pinged after a deployment is finished.
            </p>
            <Input
              value={healthCheckUrl}
              onChange={(e) => setHealthCheckUrl(e.target.value)}
              placeholder="https://your-app.example.com"
              disabled={!canManage}
            />
            {canManage && hasHealthCheckUrlChanges && (
              <div className="mt-3 flex items-center justify-end gap-3">
                <Button variant="ghost" size="sm" onClick={() => setHealthCheckUrl(originalHealthCheckUrl)}>
                  Reset
                </Button>
                <Button variant="primary" size="sm" onClick={() => void handleSaveHealthCheckUrl()} loading={savingHealthCheck}>
                  Save
                </Button>
                {savedHealthCheck && <span className="text-xs text-success-500 font-medium">Saved</span>}
              </div>
            )}
          </div>
        )}
      </SettingsCard>

      {/* Keys */}
      <SettingsCard padded>
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">Keys</p>
          <p className="text-xs text-text-muted mt-0.5">Your project's public SSH keys.</p>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-text-muted">Site public key</span>
          <p className="text-xs text-text-muted mb-2">
            Typically, this key will automatically be added to GitHub, GitLab. However, if you need to add it to a source control service manually, you may copy it from here.
          </p>
          <CopyableField value={`ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... dockier@${project.name}`} />
        </div>
      </SettingsCard>
    </div>
  );
}
