import Image from "next/image";

import { getFileIcon } from "@/components/projects/FileLinkRow";
import type { QuickLink } from "@/lib/data/project-details";

type FileTypeIconProps = {
  type: QuickLink["type"];
  wrapperSize?: number;
  iconSize?: number;
  className?: string;
  background?: boolean;
};

export function FileTypeIcon({
  type,
  wrapperSize = 44,
  iconSize = 40,
  className = "",
  background = false,
}: FileTypeIconProps) {
  const { src, alt } = getFileIcon(type);

  return (
    <div
      className={`flex items-center justify-center rounded-xl ${background ? "bg-muted/40" : ""} ${className}`}
      style={{ width: wrapperSize, height: wrapperSize }}
    >
      <span className="relative" style={{ width: iconSize, height: iconSize }}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes={`${iconSize}px`}
          className="object-contain"
        />
      </span>
    </div>
  );
}
