import { useState } from "react";
import CredentialSection, { type Credential, type CredentialFieldConfig } from "./CredentialSection";

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
    <CredentialSection<ComposerCredential>
      title="Composer package authentication"
      description="Dockier allows you to manage the http-basic portion of your site's auth.json Composer configuration file. The file is loaded on-demand from the server and no credential data is stored by Dockier."
      linkText="Learn more"
      linkHref="#"
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
  );
}
