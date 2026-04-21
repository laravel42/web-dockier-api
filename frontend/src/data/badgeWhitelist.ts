/**
 * Whitelist of tech names allowed to appear as badges on project cards.
 * Only frameworks, CMS, and CSS UI kits — no languages, runtimes, or packages.
 *
 * Edit this list to control which badges are shown.
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
