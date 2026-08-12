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
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-primary-500" : "bg-secondary-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
