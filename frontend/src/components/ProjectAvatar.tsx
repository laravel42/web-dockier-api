import { useEffect, useMemo, useState } from "react";
import type { Project } from "../types";
import { getSiteFaviconUrl, isSuitableAvatarFaviconAspectRatio, isValidFaviconUrl } from "@/utils/projectFavicon";

// Consistent muted background for all project letter fallbacks.
const FALLBACK_BG = "var(--color-secondary-100)";
const FALLBACK_TEXT = "var(--color-text-muted)";

interface Props {
  project: Project;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Public site URL (primary domain or deploy URL) used to derive favicon. */
  siteUrl?: string;
  /** Favicon resolved from repository source files via GET /git/repo-favicon. */
  repoFaviconUrl?: string;
}

const sizeClasses = {
  sm: "size-8 text-xs rounded-lg",
  md: "size-10 text-sm rounded-xl",
  lg: "size-12 text-lg rounded-xl",
};

function LetterFallback({
  project,
  size,
  className,
}: {
  project: Project;
  size: NonNullable<Props["size"]>;
  className: string;
}) {
  return (
    <div
      className={`${sizeClasses[size]} flex items-center justify-center font-semibold shrink-0 ${className}`}
      style={{ backgroundColor: FALLBACK_BG, color: FALLBACK_TEXT }}
    >
      {project.name.charAt(0).toUpperCase()}
    </div>
  );
}

function CustomAvatarImage({
  url,
  alt,
  size,
  className,
  onFailed,
}: {
  url: string;
  alt: string;
  size: NonNullable<Props["size"]>;
  className: string;
  onFailed: () => void;
}) {
  return (
    <img
      src={url}
      alt={alt}
      className={`${sizeClasses[size]} shrink-0 object-cover ${className}`}
      onError={onFailed}
    />
  );
}

/**
 * Favicon rendering.
 *
 * `object-contain` rather than `object-cover`: an SVG with no intrinsic aspect
 * ratio gives `cover` nothing to preserve, so it stretches to fill the square.
 * `contain` cannot distort under any input. Square-ish icons — the vast majority
 * after the aspect filter — fill the box identically either way.
 */
function FaviconImage({
  url,
  alt,
  size,
  className,
  onFailed,
}: {
  url: string;
  alt: string;
  size: NonNullable<Props["size"]>;
  className: string;
  onFailed: () => void;
}) {
  return (
    <div
      className={`${sizeClasses[size]} flex shrink-0 items-center justify-center overflow-hidden border border-border bg-secondary-50 ${className}`}
    >
      <img
        src={url}
        alt={alt}
        className="size-full object-contain object-center"
        onError={onFailed}
        onLoad={(event) => {
          const img = event.currentTarget;
          // Some SVGs report no intrinsic size. There is nothing to judge, and
          // object-contain cannot distort them, so let those through rather
          // than dropping a perfectly good icon to the letter fallback.
          const measurable = img.naturalWidth > 0 && img.naturalHeight > 0;
          if (measurable && !isSuitableAvatarFaviconAspectRatio(img.naturalWidth, img.naturalHeight)) {
            onFailed();
          }
        }}
      />
    </div>
  );
}

/**
 * Project avatar — custom upload, then repository favicon, then the deployed
 * site's own favicon, then a letter + color fallback.
 */
export default function ProjectAvatar({
  project,
  size = "md",
  className = "",
  siteUrl,
  repoFaviconUrl,
}: Props) {
  const avatarUrl = project.settings?.avatar;

  // Order is most-authoritative first. The repo favicon is resolved from the
  // project's own source files and cached server-side, so it outranks the
  // deployed site's /favicon.ico — which may be a framework default, or absent.
  // Getting this backwards is why a project used to show one icon in the list
  // and a different one on its own detail page.
  const imageCandidates = useMemo(() => {
    const urls: string[] = [];
    if (avatarUrl && isValidFaviconUrl(avatarUrl)) urls.push(avatarUrl);
    if (repoFaviconUrl && isValidFaviconUrl(repoFaviconUrl)) urls.push(repoFaviconUrl);
    const siteFavicon = siteUrl ? getSiteFaviconUrl(siteUrl) : undefined;
    if (siteFavicon) urls.push(siteFavicon);
    return [...new Set(urls)];
  }, [avatarUrl, siteUrl, repoFaviconUrl]);

  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [imageCandidates]);

  const imageUrl = imageCandidates[candidateIndex];
  const isCustomAvatar = Boolean(avatarUrl && imageUrl === avatarUrl);

  const advanceCandidate = () => {
    setCandidateIndex((current) => {
      const next = current + 1;
      return next < imageCandidates.length ? next : imageCandidates.length;
    });
  };

  if (imageUrl && candidateIndex < imageCandidates.length) {
    if (isCustomAvatar) {
      return (
        <CustomAvatarImage
          url={imageUrl}
          alt={project.name}
          size={size}
          className={className}
          onFailed={advanceCandidate}
        />
      );
    }

    return (
      <FaviconImage
        url={imageUrl}
        alt={project.name}
        size={size}
        className={className}
        onFailed={advanceCandidate}
      />
    );
  }

  return (
    <LetterFallback project={project} size={size} className={className} />
  );
}
