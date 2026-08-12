"use client";

import { motion } from "motion/react";
import { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface AnimatedStrikethroughProps {
  children: ReactNode;
  completed: boolean;
  className?: string;
  onAnimationComplete?: () => void;
}

export function AnimatedStrikethrough({
  children,
  completed,
  className,
  onAnimationComplete,
}: AnimatedStrikethroughProps) {
  return (
    <span className={cn("relative inline-block", className)}>
      {children}
      {/* Animated strikethrough line */}
      <motion.span
        className="bg-muted-foreground absolute top-1/2 left-0 h-[1.5px] -translate-y-1/2"
        initial={false}
        animate={{
          width: completed ? "100%" : 0,
          opacity: completed ? 1 : 0,
        }}
        transition={{
          duration: 0.5,
          ease: [0.4, 0, 0.2, 1], // Custom cubic-bezier for smooth easing
          delay: completed ? 0.3 : 0, // Delay strikethrough after check animation
        }}
        onAnimationComplete={() => {
          if (completed && onAnimationComplete) {
            onAnimationComplete();
          }
        }}
      />
    </span>
  );
}
