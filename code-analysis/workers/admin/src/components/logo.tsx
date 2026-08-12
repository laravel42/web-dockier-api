import Image from "next/image";

import { site } from "@/data/site";
import { cn } from "@/lib/utils";

export function Logo({
  className = "",
  width = 18,
  height = 18,
  src,
  alt,
}: {
  className?: string;
  width?: number;
  height?: number;
  /** Single asset override (same in light and dark). Prefer `logoLightSrc` / `logoDarkSrc` on `site`. */
  src?: string;
  alt?: string;
}) {
  const label = alt ?? site.logoAlt;

  if (src) {
    return (
      <Image
        src={src}
        width={width}
        height={height}
        className={className}
        alt={label}
      />
    );
  }

  return (
    <>
      <Image
        src={site.logoLightSrc}
        width={width}
        height={height}
        className={cn(className, "dark:hidden")}
        alt={label}
      />
      <Image
        src={site.logoDarkSrc}
        width={width}
        height={height}
        className={cn(className, "hidden dark:block")}
        alt=""
        aria-hidden
      />
    </>
  );
}
