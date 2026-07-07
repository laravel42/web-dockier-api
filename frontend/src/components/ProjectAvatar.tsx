import type { Project } from "../types";

const DEFAULT_COLOR = "#d9af7f";

interface Props {
  project: Project;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "size-8 text-xs rounded-lg",
  md: "size-10 text-sm rounded-xl",
  lg: "size-12 text-lg rounded-xl",
};

/**
 * Project avatar — shows the project's custom avatar image if set,
 * otherwise falls back to the first letter of the name with the project color.
 */
export default function ProjectAvatar({ project, size = "md", className = "" }: Props) {
  const color = project.settings?.color ?? DEFAULT_COLOR;
  const avatarUrl = project.settings?.avatar;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={project.name}
        className={`${sizeClasses[size]} object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} flex items-center justify-center font-semibold shrink-0 ${className}`}
      style={{ backgroundColor: `${color}20`, color }}
    >
      {project.name.charAt(0).toUpperCase()}
    </div>
  );
}
