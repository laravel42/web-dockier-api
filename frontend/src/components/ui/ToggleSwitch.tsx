interface ToggleSwitchProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  /** Accessible name when no visible label is associated with the switch. */
  ariaLabel?: string;
}

/**
 * Accessible toggle switch with proper ARIA role and keyboard support.
 *
 * Use this instead of raw `<button>` + inline toggle styling.
 */
export default function ToggleSwitch({ checked, onChange, disabled, ariaLabel }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      /*
        The knob is ink, not white. Both tracks are light — ochre at L 0.78 when on,
        secondary-200 at L 0.82 when off — so a white knob measured 1.97:1 and
        1.70:1 against them. Ink reads 9.3:1 and 10.8:1.
      */
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-primary-500" : "bg-secondary-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block size-3.5 rounded-full bg-primary-foreground shadow-(--shadow-xs) transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
