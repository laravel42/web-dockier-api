import type { ComponentProps } from "react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

interface InputFieldProps extends ComponentProps<typeof Input> {
  id: string;
  label: string;
  description?: string;
  error?: string;
  optional?: boolean;
  containerClassName?: string;
}

/** Shadcn Blocks pattern: Input with label, helper text, and validation error */
export function InputField({
  id,
  label,
  description,
  error,
  optional,
  required,
  containerClassName,
  className,
  ...props
}: InputFieldProps) {
  return (
    <Field data-invalid={!!error} className={containerClassName}>
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
        <Input
          id={id}
          required={required}
          aria-invalid={!!error}
          className={cn(className)}
          {...props}
        />
        {description ? <FieldDescription>{description}</FieldDescription> : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldContent>
    </Field>
  );
}
