import { resolveIcon } from "../data/devicons";
import { useTheme } from "../hooks/useTheme";

interface Props {
  /** A devicons slug (e.g. "react", "github") or a pre-resolved URL */
  src: string;
  className?: string;
  alt?: string;
}

/**
 * Renders a devicon that automatically picks the -dark / -light
 * variant when one exists locally, based on the current theme.
 *
 * Accepts either a slug ("github") or a pre-resolved URL.
 * Slugs are resolved with theme awareness; URLs are used as-is.
 */
export default function DevIcon({ src, className = "", alt = "" }: Props) {
  const dark = useTheme();

  const isUrl = src.startsWith("http") || src.startsWith("/") || src.startsWith("data:");
  const url = isUrl ? src : resolveIcon(src, dark);

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}
