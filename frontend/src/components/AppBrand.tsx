import { Link } from "react-router-dom";
import DockierMark from "./DockierMark";

type BrandSize = "lg" | "md" | "sm";

const sizeClasses: Record<
  BrandSize,
  { root: string; mark: string; wordmark: string; suffix: string }
> = {
  lg: {
    root: "gap-3",
    mark: "size-8",
    wordmark: "font-display text-xl font-semibold tracking-tight text-foreground",
    suffix: "text-sm font-normal text-muted-foreground",
  },
  md: {
    root: "gap-2.5 px-2",
    mark: "size-7",
    wordmark: "font-display text-lg font-semibold text-foreground",
    suffix: "text-sm font-normal text-muted-foreground",
  },
  sm: {
    root: "gap-2",
    mark: "size-6",
    wordmark: "font-display text-base font-semibold text-foreground",
    suffix: "text-sm font-normal text-muted-foreground",
  },
};

interface AppBrandProps {
  suffix?: string;
  size?: BrandSize;
  to?: string;
  /** When false, render static text (auth cards) */
  link?: boolean;
  /** Hide the ochre mark (admin text-only mode) */
  showMark?: boolean;
  className?: string;
}

export default function AppBrand({
  suffix = "app",
  size = "md",
  to = "/dashboard",
  link = true,
  showMark = true,
  className = "",
}: AppBrandProps) {
  const cls = sizeClasses[size];
  const content = (
    <>
      {showMark && <DockierMark className={cls.mark} />}
      <span className={cls.wordmark}>
        dockier <span className={cls.suffix}>/ {suffix}</span>
      </span>
    </>
  );

  const rootCls = `inline-flex items-center hover:opacity-90 transition-opacity ${cls.root} ${className}`;

  if (link && to) {
    return (
      <Link to={to} className={rootCls}>
        {content}
      </Link>
    );
  }

  return <div className={rootCls}>{content}</div>;
}
