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
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
        {optional ? (
          <span className="text-xs text-muted-foreground">Optional</span>
        ) : null}
      </div>
      <Input id={id} required={required} className={className} {...props} />
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
