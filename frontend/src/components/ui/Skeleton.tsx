interface SkeletonProps {
  className?: string;
}

/** Placeholder block for content that is still loading. Size it with `className` to match the real element. */
export default function Skeleton({ className = "" }: SkeletonProps) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-muted ${className}`} />;
}
