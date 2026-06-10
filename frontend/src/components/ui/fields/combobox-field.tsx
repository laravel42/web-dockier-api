import type { ReactNode } from "react";

import {
  SearchableCombobox,
  type ComboboxOption,
} from "@/components/ui/combobox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";

interface ComboboxFieldProps {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  description?: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  children?: ReactNode;
}

export function ComboboxField({
  id,
  label,
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  description,
  error,
  required,
  optional,
  disabled,
  allowEmpty,
  emptyLabel,
  className,
}: ComboboxFieldProps) {
  return (
    <Field data-invalid={!!error} className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
        {optional ? (
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            Optional
          </span>
        ) : null}
      </FieldLabel>
      <FieldContent>
        <SearchableCombobox
          id={id}
          value={value}
          onValueChange={onValueChange}
          options={options}
          placeholder={placeholder}
          searchPlaceholder={searchPlaceholder}
          disabled={disabled}
          allowEmpty={allowEmpty}
          emptyLabel={emptyLabel}
          aria-invalid={!!error}
        />
        {description ? <FieldDescription>{description}</FieldDescription> : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldContent>
    </Field>
  );
}
