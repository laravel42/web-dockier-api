import type { ComponentProps, ReactNode } from "react";
import { Input } from "./ui/input";
import { cn } from "@/utils/cn";
import { labelCls } from "@/utils/styles";

interface SettingsFieldProps {
  /** Associates the label with a control via `htmlFor`. */
  id?: string;
  label: ReactNode;
  /** Marks the field as required, visually and to a screen reader. */
  requiredMark?: boolean;
  /** Classes applied to the wrapping `<div>` (e.g. `sm:col-span-2`). */
  className?: string;
  children: ReactNode;
}

/**
 * Labeled form-field wrapper shared across the settings tabs. Encapsulates the
 * repeated `<div><label/>…</div>` markup so individual tabs stay declarative.
 * Wrap any control (combobox, custom input, etc.) as `children`.
 *
 * Note: `requiredMark` only controls the marker. HTML validation is the
 * concern of the wrapped control (e.g. `<input required>`).
 */
export function SettingsField({ id, label, requiredMark, className, children }: SettingsFieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className={cn(labelCls, "mb-1.5")}>
        {label}
        {/* The asterisk folded into the accessible name as "Name*". It is now
            hidden and paired with a spoken word, so the hint survives for a
            control that cannot carry `required` itself (a combobox, a toggle). */}
        {requiredMark ? (
          <>
            <span aria-hidden="true" className="text-danger-500"> *</span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </label>
      {children}
    </div>
  );
}

interface SettingsTextFieldProps extends ComponentProps<typeof Input> {
  id: string;
  label: ReactNode;
  /** Renders a danger-colored asterisk after the label (purely visual). */
  requiredMark?: boolean;
  /** Classes for the wrapping `<div>`. Input classes go on `className`. */
  containerClassName?: string;
}

/**
 * `SettingsField` + the design-system `Input`. Extra `className` values are
 * merged onto the input (e.g. for read-only styling). All native input props —
 * including `required` — pass through; use `requiredMark` to show the label
 * asterisk.
 */
export function SettingsTextField({
  id,
  label,
  requiredMark,
  containerClassName,
  className,
  ...inputProps
}: SettingsTextFieldProps) {
  return (
    <SettingsField id={id} label={label} requiredMark={requiredMark} className={containerClassName}>
      <Input id={id} className={className} {...inputProps} />
    </SettingsField>
  );
}
