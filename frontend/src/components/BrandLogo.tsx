import AppBrand from "./AppBrand";

interface Props {
  /** Icon size in pixels — kept for API compat; branding is text-only */
  size?: number;
  /** @deprecated Use AppBrand suffix prop */
  variant?: "light" | "dark" | "auto";
  showWordmark?: boolean;
  wordmarkClassName?: string;
  suffix?: string;
  className?: string;
}

/** @deprecated Prefer AppBrand for shell branding */
export default function BrandLogo({
  showWordmark = true,
  suffix = "app",
  className = "",
}: Props) {
  if (!showWordmark) return null;
  return <AppBrand suffix={suffix} link={false} className={className} />;
}
