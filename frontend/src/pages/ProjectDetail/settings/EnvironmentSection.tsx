import { useState, useEffect } from "react";
import { envApi } from "@/services/env";
import type { Project } from "@/types";
import { useToast } from "@/context/useToast";
import { getErrorMessage } from "@/utils/errors";
import Spinner from "@/components/Spinner";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import EnvEditor from "@/components/EnvEditor";
import { EyeIcon } from "lucide-react";
import { SectionTitle, SettingsRow } from "./shared";
import ToggleSwitch from "@/components/ui/ToggleSwitch";

interface Props {
  project: Project;
  canManage: boolean;
}

export default function EnvironmentSection({ project, canManage }: Props) {
  const [envContent, setEnvContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cacheEnabled, setCacheEnabled] = useState(true);
  const [queuesEnabled, setQueuesEnabled] = useState(true);
  const [encryptionKey, setEncryptionKey] = useState("");
  const toast = useToast();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await envApi.getMasked(project.id);
        setEnvContent(res.content);
        setOriginalContent(res.content);
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to load environment file"));
      } finally { setLoading(false); }
    };
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable
  }, [project.id]);

  const handleReveal = async () => {
    try {
      const res = await envApi.reveal(project.id);
      setEnvContent(res.content);
      setOriginalContent(res.content);
      setRevealed(true);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to reveal environment variables"));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await envApi.save(project.id, envContent);
      setOriginalContent(envContent);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save environment file"));
    } finally { setSaving(false); }
  };

  const hasChanges = revealed && envContent !== originalContent;

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Environment"
        description="Below you may edit the .env file for your application, which is a standard default environment file typically loaded by applications. If the application is uninstalled, the environment file will also be removed."
      />

      <div className="rounded-lg border border-border bg-card/40 p-4">
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
              <EnvEditor
                value={envContent}
                onChange={revealed ? setEnvContent : () => {}}
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
            <Button variant="ghost" size="sm" onClick={() => setEnvContent(originalContent)}>
              Reset
            </Button>
            {saved && <span className="text-xs text-success-500 font-medium">Saved</span>}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <SettingsRow label="Cache" description="Run cache clearing commands after updating environment variables." border={false}>
          <ToggleSwitch checked={cacheEnabled} onChange={setCacheEnabled} disabled={!canManage} />
        </SettingsRow>
      </div>

      <div className="rounded-lg border border-border bg-card/40 overflow-hidden">
        <SettingsRow label="Queues" description="Restart queue workers (and Horizon, if running) after updating environment variables." border={false}>
          <ToggleSwitch checked={queuesEnabled} onChange={setQueuesEnabled} disabled={!canManage} />
        </SettingsRow>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">Encrypted environment files</p>
          <p className="text-xs/relaxed text-text-muted mt-0.5">
            If you wish to decrypt an environment file during deployment, you may set the value of the{" "}
            <code className="rounded border border-border/50 bg-background px-1 py-0.5 text-[10px] font-mono text-primary-500">
              APP_ENV_ENCRYPTION_KEY
            </code>{" "}
            environment variable by providing your encryption key below.{" "}
            <a href="#" className="text-primary-500 hover:text-primary-400 transition-colors">Learn more</a>
          </p>
        </div>
        <Input
          type="text"
          value={encryptionKey}
          onChange={(e) => setEncryptionKey(e.target.value)}
          disabled={!canManage}
          placeholder="Enter encryption key"
        />
      </div>
    </div>
  );
}
