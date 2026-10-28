import * as React from "react"

import { cn } from "@/utils/cn"

/**
 * The input look, as a string, so a control that cannot render `<Input>` can
 * still match it — cmdk's search field in `ui/Command.tsx` is the one case.
 */
export const inputCls =
  "h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-ui transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-ui file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputCls, className)}
      {...props}
    />
  )
}

export { Input }
