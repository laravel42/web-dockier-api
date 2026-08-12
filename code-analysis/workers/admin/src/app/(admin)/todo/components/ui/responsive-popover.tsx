"use client";

import { ReactNode, useState } from "react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMediaQuery } from "@/hooks/use-media-query";

interface ResponsivePopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  title?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  contentClassName?: string;
  drawerDirection?: "top" | "right" | "bottom" | "left";
  popoverAlign?: "start" | "center" | "end";
}

/**
 * A responsive popover that uses Drawer on mobile and Popover on desktop
 *
 * @example
 * <ResponsivePopover
 *   trigger={<Button>Open</Button>}
 *   title="Select Date"
 * >
 *   <DateTimePicker />
 * </ResponsivePopover>
 */
export function ResponsivePopover({
  trigger,
  children,
  title,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  contentClassName = "p-0",
  drawerDirection = "bottom",
  popoverAlign = "end",
}: ResponsivePopoverProps) {
  const { isAtLeast } = useMediaQuery();
  const isMobile = !isAtLeast("md");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

  // Use controlled state if provided, otherwise use internal state
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const onOpenChange =
    controlledOnOpenChange !== undefined
      ? controlledOnOpenChange
      : setUncontrolledOpen;

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        direction={drawerDirection}
      >
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className={contentClassName}>
          {title && (
            <>
              <DrawerTitle className="sr-only">{title}</DrawerTitle>
              <DrawerDescription className="sr-only">{title}</DrawerDescription>
            </>
          )}
          {children}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className={contentClassName} align={popoverAlign}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
