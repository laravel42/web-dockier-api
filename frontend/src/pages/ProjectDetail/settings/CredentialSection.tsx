import { useState, useId } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { EyeIcon, EyeOffIcon, PlusIcon } from "lucide-react";
import { SectionTitle } from "./shared";
import SettingsCard from "./SettingsCard";

// ─── Types ───

export interface CredentialFieldConfig {
  /** Unique key used for state management. */
  key: string;
  /** Label shown above the input. */
  label: string;
  /** Input placeholder text. */
  placeholder?: string;
  /** Default value when opening the add modal. */
  defaultValue?: string;
  /** Whether the field is required to submit. Default: true. */
  required?: boolean;
  /** Render as a password field with reveal toggle. */
  secret?: boolean;
  /** Helper text shown below the input. */
  hint?: string;
  /** Show an "Optional" badge next to the label. */
  optional?: boolean;
}

export interface Credential {
  id: string;
  [key: string]: string | undefined;
}

export interface CredentialSectionProps<T extends Credential> {
  /** Section title. */
  title: string;
  /** Section description (supports links via SectionTitle). */
  description: string;
  /** Optional "Learn more" link text. */
  linkText?: string;
  /** Optional "Learn more" link href. */
  linkHref?: string;
  /** Whether the user has manage permissions. */
  canManage: boolean;
  /** Modal title when adding a credential. */
  modalTitle: string;
  /** Field configuration for the add modal. */
  fields: CredentialFieldConfig[];
  /** Current list of credentials. */
  credentials: T[];
  /** Called when a credential is added. Receives field values (without id). */
  onAdd: (values: Record<string, string>) => void;
  /** Called when a credential is removed by id. */
  onRemove: (id: string) => void;
  /** Render the display content for a credential row. */
  renderCredential: (credential: T) => React.ReactNode;
  /** When true, omit the page header (caller provides TabPanelHeader). */
  hideHeader?: boolean;
}

// ─── Component ───

export default function CredentialSection<T extends Credential>({
  title,
  description,
  linkText,
  linkHref,
  canManage,
  modalTitle,
  fields,
  credentials,
  onAdd,
  onRemove,
  renderCredential,
  hideHeader = false,
}: CredentialSectionProps<T>) {
  const fid = useId();
  const [showAddModal, setShowAddModal] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());

  const openModal = () => {
    // Initialize form with default values
    const initial: Record<string, string> = {};
    for (const field of fields) {
      initial[field.key] = field.defaultValue ?? "";
    }
    setFormValues(initial);
    setRevealedFields(new Set());
    setShowAddModal(true);
  };

  const closeModal = () => {
    setShowAddModal(false);
  };

  const toggleReveal = (key: string) => {
    setRevealedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const canSubmit = fields
    .filter((f) => f.required !== false)
    .every((f) => formValues[f.key]?.trim());

  const handleSubmit = () => {
    if (!canSubmit) return;
    onAdd(formValues);
    closeModal();
  };

  return (
    <div className="flex flex-col gap-6">
      {!hideHeader && (
        <SectionTitle
          title={title}
          description={description}
          linkText={linkText}
          linkHref={linkHref}
        />
      )}

      <SettingsCard padded>
        {credentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <p className="text-sm font-medium text-text">No credentials yet</p>
            <p className="text-xs text-text-muted">Get started and add your first credential.</p>
            {canManage && (
              <Button
                variant="outline"
                className="mt-3"
                onClick={openModal}
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
                <div>{renderCredential(cred)}</div>
                {canManage && (
                  <Button
                    variant="danger"
                    onClick={() => onRemove(cred.id)}
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
                onClick={openModal}
                iconLeft={<PlusIcon className="size-3.5" />}
              >
                Add credential
              </Button>
            )}
          </div>
        )}
      </SettingsCard>

      <Modal open={showAddModal} onClose={closeModal} title={modalTitle}>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            {fields.map((field, idx) => (
              <div key={field.key}>
                <label className="mb-1.5 block text-sm font-medium text-text-muted" htmlFor={`${fid}-${field.key}`}>
                  {field.label}
                  {field.optional && (
                    <span className="inline-flex items-center rounded border border-border/60 bg-card/40 px-1.5 py-0.5 text-xs font-medium text-text-muted ml-1">
                      Optional
                    </span>
                  )}
                </label>
                {field.secret ? (
                  <div className="relative">
                    <Input
                      id={`${fid}-${field.key}`}
                      type={revealedFields.has(field.key) ? "text" : "password"}
                      value={formValues[field.key] ?? ""}
                      onChange={(e) => setFormValues({ ...formValues, [field.key]: e.target.value })}
                      className="pr-10"
                      placeholder={field.placeholder}
                      autoFocus={idx === 0}
                    />
                    <Button
                      variant="ghost"
                      onClick={() => toggleReveal(field.key)}
                      className="absolute right-0 top-1/2 -translate-y-1/2"
                      aria-label={`${revealedFields.has(field.key) ? "Hide" : "Show"} ${field.label}`}
                    >
                      {revealedFields.has(field.key) ? (
                        <EyeOffIcon className="size-4" />
                      ) : (
                        <EyeIcon className="size-4" />
                      )}
                    </Button>
                  </div>
                ) : (
                  <Input
                    id={`${fid}-${field.key}`}
                    type="text"
                    value={formValues[field.key] ?? ""}
                    onChange={(e) => setFormValues({ ...formValues, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    autoFocus={idx === 0}
                  />
                )}
                {field.hint && (
                  <p className="mt-1.5 text-xs text-text-muted">{field.hint}</p>
                )}
              </div>
            ))}
          </div>

          <Button variant="primary" className="w-full" onClick={handleSubmit} disabled={!canSubmit}>
            Add credential
          </Button>
        </div>
      </Modal>
    </div>
  );
}
