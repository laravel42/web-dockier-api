import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils/cn";

interface InputWithLabelProps extends ComponentProps<typeof Input> {
  id: string;
  label: string;
  description?: string;
  optional?: boolean;
  required?: boolean;
  containerClassName?: string;
}

/** Shadcn Blocks pattern: Input/Input Standard 1 — label + field */
export function InputWithLabel({
  id,
  label,
  description,
  optional,
  required,
  containerClassName,
  className,
  ...props
}: InputWithLabelProps) {
  return (
    <div className={cn("grid gap-2", containerClassName)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {/* Hidden from the name so it does not read as "Email*", paired with
              a spoken word so the hint is not lost. */}
          {required ? (
            <>
              <span aria-hidden="true" className="text-danger-500">*</span>
              <span className="sr-only">(required)</span>
            </>
          ) : null}
        </Label>
        {optional ? (
          <span className="text-xs text-text-muted">Optional</span>
        ) : null}
      </div>
      <Input id={id} required={required} className={className} {...props} />
      {description ? (
        <p className="text-xs text-text-muted">{description}</p>
      ) : null}
    </div>
  );
}
