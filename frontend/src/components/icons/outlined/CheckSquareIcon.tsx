interface IconProps {
  /** Outer box edge length in px */
  boxSize?: number;
  /** Inner check mark edge length in px */
  iconSize?: number;
  className?: string;
}

/** Bordered square + check — fixed pixel box so flex/line-height cannot squash it. */
export default function CheckSquareIcon({
  boxSize = 16,
  iconSize = 9,
  className = "",
}: IconProps) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-sm border border-current leading-none ${className}`}
      style={{
        width: boxSize,
        height: boxSize,
        minWidth: boxSize,
        minHeight: boxSize,
      }}
      aria-hidden="true"
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        className="block"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </span>
  );
}
