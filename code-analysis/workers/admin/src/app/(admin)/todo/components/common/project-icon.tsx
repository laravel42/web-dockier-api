"use client";

import {
  Briefcase,
  Dumbbell,
  GraduationCap,
  Home,
  type LucideIcon,
  ShoppingCart,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Home,
  Briefcase,
  ShoppingCart,
  Dumbbell,
  GraduationCap,
};

interface ProjectIconProps {
  icon: string;
  className?: string;
}

export function ProjectIcon({ icon, className = "h-4 w-4" }: ProjectIconProps) {
  const Icon = iconMap[icon];
  if (!Icon) return null;
  return <Icon className={className} />;
}
