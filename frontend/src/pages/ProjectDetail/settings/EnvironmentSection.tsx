import { useState } from "react";
import { envApi } from "@/services/env";
import type { Project } from "@/types";
import { useRevealableEditor } from "@/hooks/useRevealableEditor";
import Spinner from "@/components/Spinner";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import CodeEditor from "@/components/CodeEditor";
import { EyeIcon } from "lucide-react";
import { SectionTitle, SettingsRow } from "./shared";
import SettingsCard from "./SettingsCard";
import ToggleSwitch from "@/components/ui/ToggleSwitch";

interface Props {
  project: Project;
  canManage: boolean;
}

export default function EnvironmentSection({ project, canManage }: Props) {
  const [cacheEnabled, setCacheEnabled] = useState(true);
  const [queuesEnabled, setQueuesEnabled] = useState(true);
  const [encryptionKey, setEncryptionKey] = useState("");

  const {
    content, setContent, loading, revealed, hasChanges,
    saving, saved, handleReveal, handleSave, reset,
  } = useRevealableEditor(
    {
      getMasked: () => envApi.getMasked(project.id),
      reveal: () => envApi.reveal(project.id),
      save: (c) => envApi.save(project.id, c),
    },
    [project.id],
    {
      revealErrorMessage: "Failed to reveal environment variables",
      saveErrorMessage: "Failed to save environment file",
    },
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Environment"
        description="Below you may edit the .env file for your application, which is a standard default environment file typically loaded by applications. If the application is uninstalled, the environment file will also be removed."
      />

      <SettingsCard padded>
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">Environment variables</p>
          <p className="text-xs text-text-muted mt-0.5">Your application's environment variables.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="size-4" />
          </div>
        ) : (
          <div className="relative">
            <div className={!revealed ? "blur-sm select-none pointer-events-none" : ""}>
              <CodeEditor
                value={content}
                onChange={revealed ? setContent : () => {}}
                height="280px"
                placeholder="# Add your environment variables here&#10;APP_ENV=production&#10;DB_HOST=127.0.0.1"
              />
            </div>
            {!revealed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                <p className="text-sm text-text-muted font-medium">
                  Environment variables should not be shared publicly.
                </p>
                <Button variant="outline" onClick={() => void handleReveal()}>
                  <EyeIcon className="size-3.5" />
                  Reveal
                </Button>
              </div>
            )}
          </div>
        )}

        {revealed && canManage && hasChanges && (
          <div className="mt-3 flex items-center gap-3">
            <Button variant="primary" size="sm" onClick={() => void handleSave()} loading={saving}>
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>
              Reset
            </Button>
            {saved && <span className="text-xs text-success-500 font-medium">Saved</span>}
          </div>
        )}
      </SettingsCard>

      <SettingsCard>
        <SettingsRow label="Cache" description="Run cache clearing commands after updating environment variables." border={false}>
          <ToggleSwitch checked={cacheEnabled} onChange={setCacheEnabled} disabled={!canManage} />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard>
        <SettingsRow label="Queues" description="Restart queue workers (and Horizon, if running) after updating environment variables." border={false}>
          <ToggleSwitch checked={queuesEnabled} onChange={setQueuesEnabled} disabled={!canManage} />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard padded>
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">Encrypted environment files</p>
          <p className="text-xs/relaxed text-text-muted mt-0.5">
            If you wish to decrypt an environment file during deployment, you may set the value of the{" "}
            <code className="rounded border border-border/50 bg-background px-1 py-0.5 text-xs font-mono text-primary-500">
              APP_ENV_ENCRYPTION_KEY
            </code>{" "}
            environment variable by providing your encryption key below.
          </p>
        </div>
        <Input
          type="text"
          value={encryptionKey}
          onChange={(e) => setEncryptionKey(e.target.value)}
          disabled={!canManage}
          placeholder="Enter encryption key"
        />
      </SettingsCard>
    </div>
  );
}
