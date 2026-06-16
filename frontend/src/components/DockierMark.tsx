interface Props {
  className?: string;
}

/** Theme-aware Dockier mark — ochre gradient square with D counter */
export default function DockierMark({ className = "size-7 shrink-0" }: Props) {
  return (
    <img
      src="/dockier-mark.svg"
      alt=""
      aria-hidden
      className={className}
    />
  );
}
