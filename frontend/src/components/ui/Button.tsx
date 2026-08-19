import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

// ─── Variant Styles ────────────────────────────────────────────────

// Native outlines are suppressed globally in index.css, so the ring here is the
// only focus affordance every button in the app has. Removing it makes the
// entire product unusable by keyboard.
const base =
  "inline-flex items-center justify-center gap-1.5 font-medium tracking-tight rounded-md transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 disabled:pointer-events-none";

const variants = {
  primary:
    "bg-primary text-primary-foreground shadow hover:bg-primary/90",
  secondary:
    "bg-secondary-100 text-text hover:bg-muted",
  outline:
    "border border-border bg-background shadow-(--shadow-xs) hover:bg-card/60",
  "outline-primary":
    "border border-primary text-primary bg-transparent hover:bg-primary/10",
  "outline-danger":
    "border border-danger-500 text-danger-500 bg-transparent hover:bg-danger-500/10",
  "outline-warning":
    "border border-warning-500 text-warning-500 bg-transparent hover:bg-warning-500/10",
  ghost:
    "text-text-muted hover:bg-card/60 hover:text-text",
  danger:
    "text-danger-500 hover:text-danger-700",
  link:
    "text-primary hover:text-primary/80 !h-auto !px-0",
} as const;

const sizes = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-ui",
  lg: "h-10 px-4 text-sm",
} as const;

// ─── Types ─────────────────────────────────────────────────────────

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Default: "primary" */
  variant?: ButtonVariant;
  /** Size preset. Default: "md" */
  size?: ButtonSize;
  /** Show a loading spinner and disable the button. */
  loading?: boolean;
  /** Icon element rendered before children. */
  iconLeft?: ReactNode;
  /** Icon element rendered after children. */
  iconRight?: ReactNode;
}

// ─── Component ─────────────────────────────────────────────────────

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      iconLeft,
      iconRight,
      disabled,
      className = "",
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {loading ? (
          <span className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : iconLeft ? (
          <span className="shrink-0">{iconLeft}</span>
        ) : null}
        {children}
        {iconRight && !loading ? <span className="shrink-0">{iconRight}</span> : null}
      </button>
    );
  },
);

Button.displayName = "Button";
export default Button;
