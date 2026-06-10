/**
 * Whitelist of tech names allowed to appear as badges on project cards.
 * Only frameworks, CMS, and major libraries — no languages, runtimes, or build tools.
 */
export const BADGE_WHITELIST = new Set([
  // ─── PHP Frameworks / CMS ───
  "Laravel",
  "Symfony",
  "WordPress",
  "Craft CMS",
  "Statamic",
  "Twill CMS",
  "Filament",
  "Livewire",
  "Inertia.js",

  // ─── JS/TS Frameworks ───
  "Next.js",
  "Nuxt",
  "Angular",
  "SvelteKit",
  "Remix",
  "Astro",
  "Gatsby",
  "Solid",
  "Express",
  "Fastify",
  "NestJS",
  "Hono",

  // ─── CSS / UI Kits ───
  "Tailwind CSS",
  "Bootstrap",
  "Bulma",
  "Material UI",
  "Chakra UI",
  "Ant Design",
  "Vuetify",
  "Quasar",
  "Shadcn",
  "DaisyUI",

  // ─── Python Frameworks ───
  "Django",
  "Flask",
  "FastAPI",

  // ─── Ruby Frameworks ───
  "Rails",

  // ─── Go Frameworks ───
  "Gin",
  "Echo",
  "Fiber",

  // ─── Java Frameworks ───
  "Spring",
  "Spring Boot",

  // ─── .NET Frameworks ───
  ".NET",

  // ─── Rust Frameworks ───
  "Rocket",
  "Actix",

  // ─── Elixir Frameworks ───
  "Phoenix",

  // ─── CMS / Headless ───
  "Strapi",
  "Directus",
  "Sanity",
  "Contentful",
  "Ghost",
  "KeystoneJS",

  // ─── Mobile ───
  "React Native",
  "Flutter",
  "Expo",

  // ─── Meta-frameworks / Platforms ───
  "Encore.ts",
  "Turborepo",

  // ─── Frontend Libraries (major only) ───
  "React",
  "Vue",
  "Svelte",
  "Alpine.js",
  "HTMX",

  // ─── ORM / Database ───
  "Prisma",
  "Drizzle ORM",

  // ─── API / Services ───
  "GraphQL",
  "Stripe",
  "OpenAPI",
]);

/** UI kits, ORMs, and utilities — hidden when a major framework is already detected */
export const BADGE_SECONDARY = new Set([
  "Tailwind CSS",
  "Bootstrap",
  "Bulma",
  "Material UI",
  "Chakra UI",
  "Ant Design",
  "Vuetify",
  "Quasar",
  "Shadcn",
  "DaisyUI",
  "Prisma",
  "Drizzle ORM",
  "GraphQL",
  "Stripe",
  "OpenAPI",
  "Turborepo",
  "Encore.ts",
  "Alpine.js",
  "HTMX",
]);

/** When a parent framework is detected, suppress redundant child/stack entries */
export const BADGE_SUPERSEDES: Readonly<Record<string, readonly string[]>> = {
  "Next.js": ["React"],
  "Nuxt": ["Vue"],
  "SvelteKit": ["Svelte"],
  "Remix": ["React"],
  "Gatsby": ["React"],
  "React Native": ["React"],
  "Laravel": ["PHP"],
  "Symfony": ["PHP"],
  "WordPress": ["PHP"],
  "Craft CMS": ["PHP"],
  "Statamic": ["PHP"],
  "Twill CMS": ["PHP"],
  "Filament": ["PHP"],
  "Livewire": ["PHP"],
  "Django": ["Python"],
  "Flask": ["Python"],
  "FastAPI": ["Python"],
  "Rails": ["Ruby"],
  "Spring Boot": ["Java", "Spring"],
  "Spring": ["Java"],
  ".NET": ["C#/.NET", "C#"],
  "Gin": ["Go"],
  "Echo": ["Go"],
  "Fiber": ["Go"],
  "Rocket": ["Rust"],
  "Actix": ["Rust"],
  "Phoenix": ["Elixir"],
  "Express": ["Node.js"],
  "NestJS": ["Node.js"],
  "Fastify": ["Node.js"],
  "Hono": ["Node.js"],
};
