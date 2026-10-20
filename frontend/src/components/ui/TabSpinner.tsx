import Spinner from "../Spinner";

interface TabSpinnerProps {
  label?: string;
}

/** Inline loading state for a project-detail tab or panel body. */
export default function TabSpinner({ label = "Loading…" }: TabSpinnerProps) {
  return (
    <div className="flex items-center justify-center gap-2 py-10">
      <Spinner className="size-4" />
      <span className="text-sm text-text-muted">{label}</span>
    </div>
  );
}
