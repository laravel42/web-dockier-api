import { useState, useEffect } from "react";
import { wpConfigApi } from "@/services/wp-config";
import type { Project } from "@/types";
import Spinner from "@/components/Spinner";
import Button from "@/components/ui/Button";
import WpConfigEditor from "@/components/WpConfigEditor";
import { EyeIcon } from "lucide-react";
import { SectionTitle } from "./shared";

interface Props {
  project: Project;
  canManage: boolean;
}

export default function WordPressSection({ project, canManage }: Props) {
  const [wpContent, setWpContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await wpConfigApi.getMasked(project.id);
        if (res.exists) {
          setWpContent(res.content);
          setOriginalContent(res.content);
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    void load();
  }, [project.id]);

  const handleReveal = async () => {
    try {
      const res = await wpConfigApi.reveal(project.id);
      setWpContent(res.content);
      setOriginalContent(res.content);
      setRevealed(true);
    } catch { /* silent */ }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await wpConfigApi.save(project.id, wpContent);
      setOriginalContent(wpContent);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const hasChanges = revealed && wpContent !== originalContent;

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="WordPress"
        description="Edit your wp-config.php file. This configuration is encrypted at rest and will be injected into your WordPress container during deployment."
      />

      <div className="rounded-lg border border-border bg-card/40 p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-text">wp-config.php</p>
          <p className="text-xs text-text-muted mt-0.5">
            Database credentials, authentication keys, and WordPress settings.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="size-4" />
          </div>
        ) : (
          <div className="relative">
            <div className={!revealed ? "blur-sm select-none pointer-events-none" : ""}>
              <WpConfigEditor
                value={wpContent}
                onChange={revealed ? setWpContent : () => {}}
                height="400px"
              />
            </div>
            {!revealed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
                <p className="text-sm text-text-muted font-medium">
                  WordPress configuration contains sensitive credentials.
                </p>
                <Button
                  variant="outline"
                  onClick={() => void handleReveal()}
                  iconLeft={<EyeIcon className="size-3.5" />}
                >
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
            <Button variant="ghost" size="sm" onClick={() => setWpContent(originalContent)}>
              Reset
            </Button>
            {saved && <span className="text-xs text-success-500 font-medium">Saved</span>}
          </div>
        )}
      </div>
    </div>
  );
}
