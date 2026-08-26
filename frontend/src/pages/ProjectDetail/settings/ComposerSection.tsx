import { useState } from "react";
import CredentialSection, { type Credential, type CredentialFieldConfig } from "./CredentialSection";
import { SectionTitle } from "./shared";

interface ComposerCredential extends Credential {
  repository: string;
  username: string;
}

const FIELDS: CredentialFieldConfig[] = [
  { key: "repository", label: "Repository", placeholder: "repo.packagist.com" },
  { key: "username", label: "Username" },
  { key: "password", label: "Password", secret: true },
];

interface Props {
  canManage: boolean;
}

export default function ComposerSection({ canManage }: Props) {
  const [credentials, setCredentials] = useState<ComposerCredential[]>([]);

  const handleAdd = (values: Record<string, string>) => {
    setCredentials([
      ...credentials,
      { id: crypto.randomUUID(), repository: values.repository, username: values.username },
    ]);
  };

  const handleRemove = (id: string) => {
    setCredentials(credentials.filter((c) => c.id !== id));
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="Composer"
        description="Manage http-basic credentials for private Composer repositories. Dockier loads auth.json on demand and does not store credential data."
        linkText="Learn more"
        linkHref="#"
      />
      <CredentialSection<ComposerCredential>
        hideHeader
        title="Composer"
        description=""
        canManage={canManage}
        modalTitle="New Composer credential"
        fields={FIELDS}
        credentials={credentials}
        onAdd={handleAdd}
        onRemove={handleRemove}
        renderCredential={(cred) => (
          <>
            <p className="text-sm font-medium text-text">{cred.repository}</p>
            <p className="text-xs text-text-muted mt-0.5">{cred.username}</p>
          </>
        )}
      />
    </div>
  );
}
