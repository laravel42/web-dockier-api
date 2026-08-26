import { useState } from "react";
import CredentialSection, { type Credential, type CredentialFieldConfig } from "./CredentialSection";
import { SectionTitle } from "./shared";

interface NpmCredential extends Credential {
  registry: string;
  scopes?: string;
}

const FIELDS: CredentialFieldConfig[] = [
  {
    key: "registry",
    label: "Registry",
    placeholder: "npm.pkg.github.com",
    defaultValue: "npm.pkg.github.com",
    hint: "The hostname of your private npm registry.",
  },
  { key: "token", label: "Token", secret: true },
  {
    key: "scopes",
    label: "Scopes",
    placeholder: "@my-org",
    required: false,
    optional: true,
    hint: "Packages under these scopes will be installed from this registry.",
  },
];

interface Props {
  canManage: boolean;
}

export default function NpmSection({ canManage }: Props) {
  const [credentials, setCredentials] = useState<NpmCredential[]>([]);

  const handleAdd = (values: Record<string, string>) => {
    setCredentials([
      ...credentials,
      {
        id: crypto.randomUUID(),
        registry: values.registry,
        scopes: values.scopes || undefined,
      },
    ]);
  };

  const handleRemove = (id: string) => {
    setCredentials(credentials.filter((c) => c.id !== id));
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle
        title="NPM"
        description="Manage auth tokens for private npm registries. Dockier loads .npmrc on demand and does not store credential data."
        linkText="Learn more"
        linkHref="#"
      />
      <CredentialSection<NpmCredential>
        hideHeader
        title="npm"
        description=""
        canManage={canManage}
        modalTitle="New npm credential"
        fields={FIELDS}
        credentials={credentials}
        onAdd={handleAdd}
        onRemove={handleRemove}
        renderCredential={(cred) => (
          <>
            <p className="text-sm font-medium text-text">{cred.registry}</p>
            <p className="text-xs text-text-muted mt-0.5">
              {cred.scopes ? `Scopes: ${cred.scopes}` : "All packages"}
            </p>
          </>
        )}
      />
    </div>
  );
}
