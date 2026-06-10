import type { ReactNode } from "react";
import Alert from "./Alert";
import { btnSecondary } from "../../utils/styles";

interface PageErrorProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export default function PageError({ message, onRetry, className = "" }: PageErrorProps) {
  return (
    <div className={className}>
      <Alert variant="error" className="mb-4">
        {message}
      </Alert>
      {onRetry && (
        <button type="button" onClick={onRetry} className={btnSecondary}>
          Retry
        </button>
      )}
    </div>
  );
}

/** Inline empty list message — lighter than card EmptyState. */
export function EmptyMessage({ children }: { children: ReactNode }) {
  return (
    <p className="text-text-muted text-center py-12 text-sm">{children}</p>
  );
}
