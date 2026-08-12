/** Global branding: sidebar team switcher, <Logo />, auth shell, metadata, etc. */
export const site = {
  /** Title next to the logo (sidebar team switcher, auth header, default document title) */
  title: "Shadcnblocks Admin Kit",
  description: "Shadcnblocks - Admin Kit built with NextJS",
  logoLightSrc: "/logo-black.svg",
  logoDarkSrc: "/logo-white.svg",
  logoAlt: "Shadcnblocks",
  /** Subtitle under the title in the sidebar team switcher (first team) */
  plan: "Nextjs + shadcn/ui",
  /** Sticky bar title next to the sidebar trigger (/ecommerce, /original, /developers shells) */
  dashboardAppTitle: {
    ecommerce: "Ecommerce App",
    original: "Original App",
    developers: "Developers App",
    "project-management": "Project Management",
    todo: "Todo App",
  },
} as const;
