import TechBadge from "./TechBadge";
import PlatformBadge from "./PlatformBadge";
import type { TechBadgeInfo } from "../types";
import { techBadgeHasIcon } from "../utils/techBadgeIcon";

interface Props {
  badges: TechBadgeInfo[] | undefined;
  loading?: boolean;
  platform?: string;
  limit?: number;
  /** Shown in table cells when badges are empty and no platform is set */
  emptyPlaceholder?: React.ReactNode;
  className?: string;
}

function BadgeSkeleton() {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border border-border/60 bg-card/40 shrink-0 animate-pulse"
      aria-hidden
    >
      <span className="size-4 rounded-sm bg-muted" />
      <span className="inline-block w-6 h-2.5 rounded-sm bg-muted" />
    </span>
  );
}

export default function ProjectTechBadges({
  badges,
  loading = false,
  platform,
  limit = 4,
  emptyPlaceholder = null,
  className = "",
}: Props) {
  if (loading) {
    const skeletonCount = Math.min(limit, 3);
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`} aria-busy="true">
        {Array.from({ length: skeletonCount }, (_, i) => (
          <BadgeSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Filter before slicing: a stack with no icon would otherwise spend one of the
  // few available slots on a chip with an empty square in it.
  const withIcons = badges?.filter((b) => techBadgeHasIcon(b.name)) ?? [];

  if (withIcons.length > 0) {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        {withIcons.slice(0, limit).map((b) => (
          <TechBadge key={b.name} name={b.name} iconSize="size-3.5" />
        ))}
      </div>
    );
  }

  if (platform) {
    return (
      <div className={className}>
        <PlatformBadge slug={platform} />
      </div>
    );
  }

  return <>{emptyPlaceholder}</>;
}
