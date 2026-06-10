import { useId } from "react";

interface Props {
  className?: string;
}

/** Theme-aware Dockier mark — ochre gradient square with D counter */
export default function DockierMark({ className = "size-7 shrink-0" }: Props) {
  const uid = useId().replace(/:/g, "");

  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`${uid}-mark`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="oklch(0.78 0.08 70)" />
          <stop offset="1" stopColor="oklch(0.84 0.07 75)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="7" fill={`url(#${uid}-mark)`} />
      <path
        d="M10 9h7.5a7 7 0 0 1 0 14H10V9zm4 3.5v7h3.5a3.5 3.5 0 0 0 0-7H14z"
        fill="oklch(0.18 0.01 50)"
      />
    </svg>
  );
}
