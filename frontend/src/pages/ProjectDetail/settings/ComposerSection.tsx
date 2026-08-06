import { useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { EyeIcon, PlusIcon } from "lucide-react";
import { SectionTitle } from "./shared";

interface Props {
  canManage: boolean;
}

export default function ComposerSection({ canManage }: Props) {
  const [credentials, setCredentials] = useState<Array<{ id: string; repository: string; username: string }>>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRepo, setNewRepo] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleAdd = () => {
    if (!newRepo || !newUsername || !newPassword) return;
    setCredentials([...credentials, { id: crypto.randomUUID(), repository: newRepo, username: newUsername }]);
    setNewRepo("");
    setNewUsername("");
    setNewPassword("");
    setShowPassword(false);
    setShowAddModal(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Composer package authentication"
        description="Dockier allows you to manage the http-basic portion of your site's auth.json Composer configuration file. The file is loaded on-demand from the server and no credential data is stored by Dockier."
        linkText="Learn more"
        linkHref="#"
      />

      <div className="rounded-lg border border-border bg-card/40 p-4">
        {credentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <p className="text-sm font-medium text-text">No Composer credentials yet</p>
            <p className="text-xs text-text-muted">Get started and add your first Composer credentials.</p>
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
                  <p className="text-sm font-medium text-text">{cred.repository}</p>
                  <p className="text-xs text-text-muted mt-0.5">{cred.username}</p>
                </div>
                {canManage && (
                  <Button
                    variant="danger"
                    onClick={() => setCredentials(credentials.filter((c) => c.id !== cred.id))}
                  >
                    Remove
                  </Button>
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

      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="New Composer credential">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-muted">Repository</label>
              <Input
                type="text"
                value={newRepo}
                onChange={(e) => setNewRepo(e.target.value)}
                placeholder="repo.packagist.com"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-muted">Username</label>
              <Input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder=""
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-muted">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10"
                  placeholder=""
                />
                <Button
                  variant="ghost"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-1/2 -translate-y-1/2"
                >
                  <EyeIcon className="size-4" />
                </Button>
              </div>
            </div>
          </div>

          <Button variant="primary" className="w-full" onClick={handleAdd} disabled={!newRepo || !newUsername || !newPassword}>
            Add credential
          </Button>
        </div>
      </Modal>
    </div>
  );
}
