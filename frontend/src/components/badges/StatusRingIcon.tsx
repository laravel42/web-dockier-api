interface Props {
  status: string;
  className?: string;
}

type Kind = "success" | "failed" | "pending";

function kindFor(status: string): Kind {
  if (status === "success" || status === "completed") return "success";
  if (status === "failed" || status === "destroyed") return "failed";
  return "pending";
}

export default function StatusRingIcon({ status, className = "" }: Props) {
  const kind = kindFor(status);
  const bg =
    kind === "success" ? "bg-success-500" : kind === "failed" ? "bg-danger-500" : "bg-warning-500";

  return (
    <span
      title={status}
      aria-label={status}
      className={`absolute -bottom-1 -right-1 flex size-3.5 items-center justify-center rounded-full text-white ring-2 ring-card ${bg} ${className}`}
    >
      {kind === "success" && (
        <svg
          viewBox="0 0 24 24"
          className="size-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
      {kind === "failed" && (
        <svg
          viewBox="0 0 24 24"
          className="size-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      )}
      {kind === "pending" && <span className="size-1.5 rounded-full bg-white" />}
    </span>
  );
}
