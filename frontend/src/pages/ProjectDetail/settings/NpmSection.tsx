import { useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { EyeIcon, PlusIcon } from "lucide-react";
import { SectionTitle } from "./shared";

interface Props {
  canManage: boolean;
}

export default function NpmSection({ canManage }: Props) {
  const [credentials, setCredentials] = useState<Array<{ id: string; registry: string; scopes?: string }>>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRegistry, setNewRegistry] = useState("npm.pkg.github.com");
  const [newToken, setNewToken] = useState("");
  const [newScopes, setNewScopes] = useState("");
  const [showToken, setShowToken] = useState(false);

  const handleAdd = () => {
    if (!newRegistry || !newToken) return;
    setCredentials([...credentials, { id: crypto.randomUUID(), registry: newRegistry, scopes: newScopes || undefined }]);
    setNewRegistry("npm.pkg.github.com");
    setNewToken("");
    setNewScopes("");
    setShowToken(false);
    setShowAddModal(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="npm package authentication"
        description="Dockier allows you to manage the auth tokens in your project's .npmrc configuration file. The file is loaded on-demand from the server and no credential data is stored by Dockier."
        linkText="Learn more"
        linkHref="#"
      />

      <div className="rounded-lg border border-border bg-card/40 p-4">
        {credentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <p className="text-sm font-medium text-text">No npm credentials yet</p>
            <p className="text-xs text-text-muted">Get started and add your first npm credentials.</p>
            {canManage && (
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => setShowAddModal(true)}
                iconLeft={<PlusIcon className="size-3.5" />}
              >
                Add credential
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {credentials.map((cred) => (
              <div key={cred.id} className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-text">{cred.registry}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {cred.scopes ? `Scopes: ${cred.scopes}` : "All packages"}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setCredentials(credentials.filter((c) => c.id !== cred.id))}
                    className="text-xs text-danger-500 hover:text-danger-400 font-medium transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {canManage && (
              <Button
                variant="outline"
                className="self-start mt-1"
                onClick={() => setShowAddModal(true)}
                iconLeft={<PlusIcon className="size-3.5" />}
              >
                Add credential
              </Button>
            )}
          </div>
        )}
      </div>

      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="New npm credential">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-muted">Registry</label>
              <Input type="text" value={newRegistry} onChange={(e) => setNewRegistry(e.target.value)} placeholder="npm.pkg.github.com" autoFocus />
              <p className="mt-1.5 text-xs text-text-muted">The hostname of your private npm registry.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-muted">Token</label>
              <div className="relative">
                <Input type={showToken ? "text" : "password"} value={newToken} onChange={(e) => setNewToken(e.target.value)} className="pr-10" placeholder="" />
                <Button
                  variant="ghost"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-0 top-1/2 -translate-y-1/2"
                >
                  <EyeIcon className="size-4" />
                </Button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-muted">
                Scopes{" "}
                <span className="inline-flex items-center rounded border border-border/60 bg-card/40 px-1.5 py-0.5 text-[10px] font-medium text-text-muted ml-1">Optional</span>
              </label>
              <Input type="text" value={newScopes} onChange={(e) => setNewScopes(e.target.value)} placeholder="@my-org" />
              <p className="mt-1.5 text-xs text-text-muted">Packages under these scopes will be installed from this registry.</p>
            </div>
          </div>

          <Button variant="primary" className="w-full" onClick={handleAdd} disabled={!newRegistry || !newToken}>
            Add credential
          </Button>
        </div>
      </Modal>
    </div>
  );
}
