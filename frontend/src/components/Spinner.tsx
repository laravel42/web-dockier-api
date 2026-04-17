interface SpinnerProps {
  className?: string;
}

/** Reusable loading spinner. Defaults to w-6 h-6. */
export default function Spinner({ className = "w-6 h-6" }: SpinnerProps) {
  return (
    <div
      className={`${className} border-2 border-primary-500 border-t-transparent rounded-full animate-spin`}
      role="status"
      aria-label="Loading"
    />
  );
}
