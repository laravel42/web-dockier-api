"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type ScrollSpyContextValue = {
  value: string
  setValue: (value: string) => void
  viewportRef: React.RefObject<HTMLDivElement | null>
  registerSection: (value: string, element: HTMLElement | null) => void
  getSection: (value: string) => HTMLElement | null
  orientation: "horizontal" | "vertical"
  offset: number
}

const ScrollSpyContext = React.createContext<ScrollSpyContextValue | null>(null)

function getSectionOffset(viewport: HTMLElement, section: HTMLElement) {
  const viewportRect = viewport.getBoundingClientRect()
  const sectionRect = section.getBoundingClientRect()
  return sectionRect.top - viewportRect.top + viewport.scrollTop
}

function useScrollSpyContext(component: string) {
  const context = React.useContext(ScrollSpyContext)

  if (!context) {
    throw new Error(`${component} must be used within <ScrollSpy />`)
  }

  return context
}

type ScrollSpyProps = React.HTMLAttributes<HTMLDivElement> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  orientation?: "horizontal" | "vertical"
  offset?: number
}

export function ScrollSpy({
  value,
  defaultValue = "",
  onValueChange,
  orientation = "vertical",
  offset = 0,
  className,
  ...props
}: ScrollSpyProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue)
  const currentValue = value ?? uncontrolledValue
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const sectionsRef = React.useRef(new Map<string, HTMLElement>())

  const setValue = React.useCallback(
    (nextValue: string) => {
      if (value === undefined) {
        setUncontrolledValue(nextValue)
      }

      onValueChange?.(nextValue)
    },
    [onValueChange, value]
  )

  const registerSection = React.useCallback(
    (sectionValue: string, element: HTMLElement | null) => {
      if (!element) {
        sectionsRef.current.delete(sectionValue)
        return
      }

      sectionsRef.current.set(sectionValue, element)
    },
    []
  )

  const getSection = React.useCallback((sectionValue: string) => {
    return sectionsRef.current.get(sectionValue) ?? null
  }, [])

  React.useEffect(() => {
    const viewport = viewportRef.current

    if (!viewport) {
      return
    }

    const updateActiveSection = () => {
      const scrollTop = viewport.scrollTop + offset + 24
      const orderedSections = [...sectionsRef.current.entries()].sort(
        (left, right) =>
          getSectionOffset(viewport, left[1]) - getSectionOffset(viewport, right[1])
      )

      let activeValue = orderedSections[0]?.[0] ?? ""

      const isNearBottom =
        viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2

      if (isNearBottom) {
        activeValue = orderedSections.at(-1)?.[0] ?? activeValue
      } else {
        for (const [sectionValue, element] of orderedSections) {
          if (getSectionOffset(viewport, element) <= scrollTop) {
            activeValue = sectionValue
          } else {
            break
          }
        }
      }

      if (activeValue && activeValue !== currentValue) {
        setValue(activeValue)
      }
    }

    updateActiveSection()
    viewport.addEventListener("scroll", updateActiveSection, { passive: true })
    window.addEventListener("resize", updateActiveSection)

    return () => {
      viewport.removeEventListener("scroll", updateActiveSection)
      window.removeEventListener("resize", updateActiveSection)
    }
  }, [currentValue, offset, setValue])

  return (
    <ScrollSpyContext.Provider
      value={{
        value: currentValue,
        setValue,
        viewportRef,
        registerSection,
        getSection,
        orientation,
        offset,
      }}
    >
      <div
        data-orientation={orientation}
        className={cn("flex min-h-0", className)}
        {...props}
      />
    </ScrollSpyContext.Provider>
  )
}

export const ScrollSpyNav = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function ScrollSpyNav({ className, ...props }, ref) {
  const { orientation } = useScrollSpyContext("ScrollSpyNav")

  return (
    <div
      ref={ref}
      data-orientation={orientation}
      className={cn(
        "flex",
        orientation === "vertical" ? "flex-col" : "flex-row",
        className
      )}
      {...props}
    />
  )
})

type ScrollSpyLinkProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string
}

export const ScrollSpyLink = React.forwardRef<
  HTMLButtonElement,
  ScrollSpyLinkProps
>(function ScrollSpyLink({ value, className, onClick, ...props }, ref) {
  const { value: activeValue, setValue, getSection, viewportRef, offset } =
    useScrollSpyContext("ScrollSpyLink")

  return (
    <button
      ref={ref}
      type="button"
      data-state={activeValue === value ? "active" : "inactive"}
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event)

        if (event.defaultPrevented) {
          return
        }

        const section = getSection(value)
        const viewport = viewportRef.current

        if (section && viewport) {
          viewport.scrollTo({
            top: Math.max(getSectionOffset(viewport, section) - offset, 0),
            behavior: "smooth",
          })
        }

        setValue(value)
      }}
      {...props}
    />
  )
})

export const ScrollSpyViewport = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function ScrollSpyViewport({ className, ...props }, forwardedRef) {
  const { viewportRef, orientation } = useScrollSpyContext("ScrollSpyViewport")

  const composedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current = node

      if (typeof forwardedRef === "function") {
        forwardedRef(node)
      } else if (forwardedRef) {
        forwardedRef.current = node
      }
    },
    [forwardedRef, viewportRef]
  )

  return (
    <div
      ref={composedRef}
      data-orientation={orientation}
      className={cn("min-h-0", className)}
      {...props}
    />
  )
})

type ScrollSpySectionProps = React.HTMLAttributes<HTMLElement> & {
  value: string
  asChild?: false
}

export const ScrollSpySection = React.forwardRef<
  HTMLElement,
  ScrollSpySectionProps
>(function ScrollSpySection(
  { value, className, children, ...props },
  forwardedRef
) {
  const { registerSection, orientation } = useScrollSpyContext("ScrollSpySection")
  const localRef = React.useRef<HTMLElement | null>(null)

  const composedRef = React.useCallback(
    (node: HTMLElement | null) => {
      localRef.current = node
      registerSection(value, node)

      if (typeof forwardedRef === "function") {
        forwardedRef(node)
      } else if (forwardedRef) {
        forwardedRef.current = node
      }
    },
    [forwardedRef, registerSection, value]
  )

  return (
    <section
      ref={composedRef}
      data-orientation={orientation}
      data-section={value}
      className={cn("scroll-mt-6", className)}
      {...props}
    >
      {children}
    </section>
  )
})
