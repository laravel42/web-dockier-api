import Spinner from "../Spinner";

interface PageLoadingProps {
  label?: string;
}

export default function PageLoading({ label }: PageLoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Spinner />
      {label && <p className="text-sm text-text-muted">{label}</p>}
    </div>
  );
}
