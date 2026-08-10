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

  const deployHookUrl = `https://dockier.dev/api/projects/${project.id}/deploy/hook?token=${project.id.slice(0, 8)}`;

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Deployments"
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
            <code className="text-[11px] text-text-muted font-mono break-all select-all bg-secondary-50 px-2 py-1 rounded border border-border">
              {deployHookUrl}
            </code>
            <p className="text-[10px] text-text-muted mt-1.5">
              Add this URL as a webhook in your Git provider, or use the HMAC-signed endpoint at <code className="text-[10px]">/deploy/webhook/git-push</code> for production setups.
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
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={false}
              disabled
              className="size-3.5 rounded border-border accent-primary-500"
            />
            <span className="text-xs text-text-muted">
              Make <code className="rounded border border-border/50 bg-background px-1 py-0.5 text-[10px] font-mono">.env</code> variables available to deployment script
            </span>
            <span className="text-[10px] font-medium text-text-muted/70 bg-secondary-50 border border-border/50 rounded px-1.5 py-0.5">Coming soon</span>
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
          border={false}
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-text-muted/70 bg-secondary-50 border border-border/50 rounded px-1.5 py-0.5">Coming soon</span>
            <ToggleSwitch checked={false} onChange={() => {}} disabled />
          </div>
        </SettingsRow>
      </SettingsCard>

      {/* Keys */}
      <SettingsCard padded>
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
      </SettingsCard>
    </div>
  );
}
