---
name: Dockier
description: Zero-config security scanning and deployment for small engineering teams.
colors:
  lamplight-ochre: "oklch(0.78 0.08 70)"
  lamplight-ochre-deep: "oklch(0.70 0.08 68)"
  ink-on-ochre: "oklch(0.18 0.01 50)"
  banked-graphite: "oklch(0.17 0.008 50)"
  sunk-graphite: "oklch(0.19 0.008 50)"
  raised-graphite: "oklch(0.21 0.009 50)"
  muted-graphite: "oklch(0.23 0.008 50)"
  field-well: "oklch(0.28 0.008 50)"
  filament-line: "oklch(0.32 0.008 50 / 60%)"
  warm-bone: "oklch(0.95 0.008 60)"
  dimmed-bone: "oklch(0.68 0.012 60)"
  deep-signal-blue: "oklch(0.117 0.0213 240.5)"
  signal-success: "#10b981"
  signal-warning: "#f59e0b"
  signal-danger: "#ef4444"
  danger-surface: "oklch(0.27 0.055 25)"
  danger-line: "oklch(0.40 0.075 25)"
  danger-ink: "oklch(0.72 0.13 25)"
  caution-surface: "oklch(0.27 0.055 50)"
  caution-line: "oklch(0.40 0.075 50)"
  caution-ink: "oklch(0.72 0.13 50)"
  warning-surface: "oklch(0.27 0.055 75)"
  warning-line: "oklch(0.40 0.075 75)"
  warning-ink: "oklch(0.72 0.13 75)"
  info-surface: "oklch(0.27 0.055 240)"
  info-line: "oklch(0.40 0.075 240)"
  info-ink: "oklch(0.72 0.13 240)"
  success-surface: "oklch(0.27 0.055 155)"
  success-line: "oklch(0.40 0.075 155)"
  success-ink: "oklch(0.72 0.13 155)"
  destructive: "oklch(0.65 0.2 25)"
  legacy-berry: "#AB2022"
  legacy-seed: "#E3AF45"
  legacy-dusk: "#2E1B1A"
  legacy-cream: "#F9F4EE"
typography:
  scale:
    display: "22px"
    metric: "20px"
    headline: "18px"
    title: "16px"
    body: "15px"
    prose: "14px"
    label: "13px"
    caption: "12px"
  display:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.035em"
    fontFeature: "ss01, ss02"
  headline:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "-0.005em"
    fontFeature: "ss01, ss02"
  label:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "normal"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  card: "16px"
spacing:
  stack-sm: "8px"
  stack: "12px"
  panel: "16px"
  page: "24px"
components:
  button-primary:
    backgroundColor: "{colors.lamplight-ochre}"
    textColor: "{colors.ink-on-ochre}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "oklch(0.78 0.08 70 / 90%)"
    textColor: "{colors.ink-on-ochre}"
  button-outline:
    backgroundColor: "{colors.banked-graphite}"
    textColor: "{colors.warm-bone}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.dimmed-bone}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.warm-bone}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
    height: "32px"
  card:
    backgroundColor: "{colors.raised-graphite}"
    textColor: "{colors.warm-bone}"
    rounded: "{rounded.lg}"
    padding: "16px"
  nav-link-active:
    backgroundColor: "oklch(0.78 0.08 70 / 10%)"
    textColor: "{colors.warm-bone}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  nav-link-idle:
    backgroundColor: "transparent"
    textColor: "{colors.dimmed-bone}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
---

# Design System: Dockier

## Overview

**Creative North Star: "The Lamplit Control Room"**

Dockier is a dark room with one warm light in it. Every surface is a warm graphite — never a neutral gray, always carrying a trace of red-orange in the hue (50–60) at almost no saturation (chroma 0.008–0.012) — and a single ochre light source sits above the top edge of every page, falling off into the dark. That one light is the whole color story. It marks where you can act and where the system is paying attention, and it appears nowhere else.

The room is dense. This is an operator's surface: scan findings, dependency tables, deploy logs, commit lists. Headings are capped at 22px by CSS enforcement, controls stand 28–40px tall, and the base text is 15px on a 1.55 rhythm. Nothing is oversized, because everything on screen is something the user is reading rather than being sold. Density here reads as instrumentation, not clutter — the compactness is what lets a whole scan result sit in one viewport.

Depth is a lie the system refuses to tell. There are no drop shadows carrying hierarchy; structure comes from hairline borders, one-step tonal shifts between graphite planes, and translucency over a fixed background. Two fixed atmospheric layers sit behind everything: an ochre radial glow at the top of the viewport and a 115° hatch texture at 1.5% opacity under a radial mask. Both are pinned to the viewport, never scroll, and are protected identity — they are the light and the air of the room.

**Key Characteristics:**

- Warm graphite neutrals, never true gray (hue 50–60, chroma ≤0.012)
- One ochre accent at low chroma (0.08), used scarcely and functionally
- Dark-first: the dark palette is the default; light is the override
- Flat by law — hairline borders and tonal steps carry all hierarchy
- Compact by design — 22px heading ceiling, 32px default control height
- Fixed atmosphere: ochre glow + 115° hatch, pinned to the viewport
- Space Grotesk throughout with `ss01`/`ss02` alternates and negative tracking

## Colors

A single warm ochre light source over a nine-step warm-graphite ramp, with saturated color reserved entirely for severity signalling.

### Primary

- **Lamplight Ochre** (`oklch(0.78 0.08 70)`): The only accent in the system. It marks primary actions, focus rings, active navigation, scrollbar thumbs, the first chart series, and the atmospheric glow. Its chroma is deliberately low (0.08) — this is lamplight, not a highlighter. At 10% opacity it becomes the active-navigation wash; at 35%/55% it becomes the scrollbar at rest/hover.
- **Lamplight Ochre Deep** (`oklch(0.70 0.08 68)`): The pressed and hover-deepened step, and the darker end of the ochre ramp.
- **Ink on Ochre** (`oklch(0.18 0.01 50)`): The near-black warm ink that sits on ochre fills. Never use Warm Bone on ochre — the contrast inverts.

### Neutral

The graphite ramp is the entire structural vocabulary. Each step is one perceptible tone apart, which is what makes flat layering legible.

- **Banked Graphite** (`oklch(0.17 0.008 50)`): The page floor. The darkest surface, and the only one the atmosphere renders on.
- **Sunk Graphite** (`oklch(0.19 0.008 50)`): Navigation and sidebar chrome — one step below the page so chrome recedes.
- **Raised Graphite** (`oklch(0.21 0.009 50)`): Cards, popovers, dialogs. The default content plane.
- **Muted Graphite** (`oklch(0.23 0.008 50)`): Inert fills — disabled states, table zebra, secondary wells.
- **Field Well** (`oklch(0.28 0.008 50)`): Input interiors.
- **Filament Line** (`oklch(0.32 0.008 50 / 60%)`): The hairline. This 60% alpha is deliberate — the border must read as a drawn line, not a hard edge.
- **Warm Bone** (`oklch(0.95 0.008 60)`): Primary text. Warm off-white, never pure `#fff`.
- **Dimmed Bone** (`oklch(0.68 0.012 60)`): Secondary text, idle icons, placeholder copy.

### Tertiary

- **Deep Signal Blue** (`oklch(0.117 0.0213 240.5)`): Terminal, log, and build-output surfaces only, via `bg-terminal`. The one place the system leaves the warm hue family, because a console should read as a different kind of object.

  **Sanctioned exception:** log *content* inside these surfaces uses a conventional ANSI-style palette (green success, red error, cyan rule, blue info, yellow step, amber warning, neutral default). This is the single place raw non-system colors are correct, because the console is imitating a terminal rather than expressing the brand. It applies to log line rendering only — never to surrounding chrome.

### Named Rules

**The One Light Rule.** Lamplight Ochre covers no more than ~10% of any screen. It marks interaction and system attention — primary action, focus, active nav, series-1 — and is never used as decoration, never as a section divider, never as a background for content. Its scarcity is the entire reason it reads as "act here."

**The Severity Is Not Brand Rule.** Success, Warning, and Danger (`#10b981`, `#f59e0b`, `#ef4444`) are a separate, functional language. They never borrow ochre, and ochre never stands in for them. Likewise the legacy berry (`#AB2022`), seed, dusk, and cream scales are reserved for severity states and marketing accents only — they are not the product's identity and must not return as primary surfaces.

**The Warm Neutral Rule.** No true gray. Every neutral carries hue 50–60 at chroma 0.008–0.012. A `#71717a` dropped into this system reads instantly as foreign.

### The Signal Ramp

Severity is a **five-step ordinal scale plus success**, not four ad-hoc colours. Each step carries
three tokens — `surface` (fill), `line` (border), `ink` (text and icon).

| Step | Hue | Reads as |
|---|---|---|
| `danger` | 25 | Critical · blocker · secret · deprecated |
| `caution` | 50 | High · sensitive |
| `warning` | 75 | Medium · personal · outdated · cancelled |
| `info` | 240 | Low · internal · informational |
| `success` | 155 | Clean · none · active · public |

Within a theme, **lightness and chroma are identical across all steps**; only hue moves. That is
what makes six different signals read as one family rather than six opinions. Dark uses
`surface oklch(0.27 0.055 H)` / `line oklch(0.40 0.075 H)` / `ink oklch(0.72 0.13 H)`; light uses
`0.955 0.035` / `0.86 0.065` / `0.50 0.14` at the same hues.

**Every ink clears 4.5:1 on its own surface and on the bare card, in both themes.** Worst case is
4.89:1. This is a hard floor, not an aspiration — the previous raw-palette pills measured as low as
1.21:1 on the light card.

**Low is `info`, never `success`.** A low-severity finding is still a finding. Green means *there is
nothing to do here* — clean, none, active, public. Using it for "low" tells the user a problem is a
non-problem.

**The `-50 / -100 / -500 / -700` signal steps are legacy.** They are light-mode tints and a fixed
hex text colour; `bg-danger-50` on the dark card is a near-white pill. Do not reach for them for new
badge work — they remain only for surfaces not yet migrated (see
`docs/delivery/palette-token-mapping.md`).

**Severity is never carried by colour alone.** Every severity surface pairs its colour with a label,
a count, or a glyph. The `++`/`--` diff counters keep their punctuation and add a screen-reader-only
word.

### Light Theme

The dark palette is the default (`:root`); light is the `[data-theme="light"]` override and inverts the graphite ramp while keeping the accent fixed. Ochre does not change between themes — the light source is the same lamp in both rooms. Page floor becomes `oklch(0.97 0.008 60)`, cards become `oklch(1 0.005 60)`, text becomes `oklch(0.22 0.01 50)`, and the hairline hardens to a solid `oklch(0.88 0.01 55)`. Every color decision must hold in both.

## Typography

**Display Font:** Space Grotesk (with `ui-sans-serif`, `system-ui`, `sans-serif`)
**Body Font:** Space Grotesk — the same family
**Label/Mono Font:** Space Grotesk — the same family

**Character:** One family does every job. Space Grotesk's slightly mechanical, wide-aperture geometry gives the interface its instrument quality, and the `ss01`/`ss02` stylistic alternates are enabled globally on body and display text — they are part of the identity, not an optional flourish. The system is self-hosted from `/fonts/space-grotesk.woff2` as a single variable cut (weight 400–700) with `font-display: swap`.

### Hierarchy

- **Display** (600, 22px, 1.02, -0.035em): `h1`. The largest text in the product, full stop.
- **Headline** (600, 18px, 1.08, -0.03em): `h2`. Section headers within a page.
- **Title** (600, 16px, 1.15, -0.025em): `h3`. Card and panel headers.
- **Body** (400, 15px, 1.55, -0.005em): The base document setting. Paragraphs step down to 14px (`--text-sm`) — the 15px base governs UI text, the 14px step governs prose.
- **Label** (500, 13px, 1.45): `--text-ui`, the workhorse for buttons, inputs, table cells, and nav. Most text in this product is this size.
- **Table Head** (13px→12px, 0.04em tracking, uppercase): The one place the system uses uppercase and positive tracking, in `.table-compact thead th`.

### The Ramp

Eight steps, and nothing between them:

| Step | Size | Role |
| --- | --- | --- |
| Display | 22px | `h1` — the largest text in the product |
| Metric | 20px | Large tabular figures in readouts (`--text-xl`) |
| Headline | 18px | `h2` — section headers |
| Title | 16px | `h3` — card and panel headers |
| Body | 15px | The base document setting |
| Prose | 14px | Paragraph copy (`--text-sm`) |
| Label | 13px | `--text-ui` — buttons, inputs, table cells, nav |
| Caption | 12px | `--text-xs` — table heads, badges, metadata |

**12px is the floor.** Anything smaller is not a step, it is an escape hatch — and at 9–11px it fails legibility for exactly the operator squinting at a dense scan result on a laptop. Dense rows get their compactness from the 13px label and 12px caption, not from inventing a fourth micro-size.

### Named Rules

**The 22px Ceiling Rule.** Nothing in the app renders larger than 22px. This is enforced in CSS, not convention — `:is(h1…h6)[class*="text-2xl"]` and larger utilities are overridden to `var(--heading-max-size)` with `!important`. Do not fight it with a bigger utility class; if a surface needs more presence, get it from weight, color, or space.

**The Tightening Rule.** Tracking tightens as size grows: -0.005em at body, -0.025em at `h3`, -0.03em at `h2`, -0.035em at `h1` and all `.font-display` text. Larger type never sits at default tracking.

**The One Family Rule.** There is no second typeface — not for headings, not for code. `--font-mono` resolves to Space Grotesk too. Code surfaces are distinguished by background and token color, never by a monospace family.

## Layout

The application is a top-navbar shell, not a sidebar app. A sticky 56px header (`h-14`) carries brand, primary nav, and utility icons; it sits at `bg-card/30` with `backdrop-blur` and a `border-border/40` underline, so content scrolls visibly beneath it.

Page rhythm is driven by a small, explicit density scale rather than a generic spacing ramp: 24px page padding (`--space-page-x/y`), 16px between sections and inside panels (`--space-section`, `--space-panel`), 12px default stack (`--space-stack`), 8px tight stack (`--space-stack-sm`). Horizontal page padding steps 16px → 24px → 32px (`px-4 sm:px-6 lg:px-8`).

Data-dense surfaces use `.table-compact`: 8px/12px cell padding at 13px with an uppercase, letter-spaced head. This is the system's densest register and the reason the type ceiling exists.

Responsive behavior is currently a two-step: `sm:` carries the overwhelming majority of adaptation (45 usages), `lg:` handles the page-padding and layout widening (14), with `md:` and `xl:` barely present (4 and 3). Phone-width support is a confirmed product requirement (see `PRODUCT.md` → *Platform*), so **new work should treat the thin `md:` coverage as a gap to close, not a pattern to copy.**

### Named Rules

**The Chrome Recedes Rule.** Navigation sits one tonal step *below* the page floor (Sunk Graphite under Banked Graphite) and is translucent. Chrome never competes with content for brightness.

## Elevation & Depth

**In-page surfaces are flat by law.** `--shadow-xs: 0 1px 2px 0 oklch(0 0 0 / 12%)` exists only to keep a filled button from dissolving into its background, not to imply height. Within the page, hierarchy is carried by three devices and no others:

1. **Tonal step** — each plane is one graphite step apart (0.17 → 0.19 → 0.21 → 0.23).
2. **Hairline border** — `Filament Line` at 60% alpha draws the edge that a shadow would otherwise imply.
3. **Translucency over fixed atmosphere** — `bg-card/30`, `bg-card/40`, `bg-card/60` let the background gradient show through, which reads as air rather than lift.

**Overlays are the one exception.** Anything that floats above the page — modal, dropdown, popover, toast, context menu — carries `--shadow-overlay`, a single two-layer token with real offset and falloff:

```
--shadow-overlay: 0 8px 24px -4px oklch(0 0 0 / 40%), 0 2px 6px -2px oklch(0 0 0 / 30%);
```

The light theme redefines it far weaker (12% / 8%), because 40% black over near-white reads as dirt rather than depth. This is the *only* elevation value in the system; there is no scale, and `shadow-lg` / `shadow-xl` / `shadow-md` must never reappear.

The only blur in the system is the sticky navbar's `backdrop-blur`, behind a `supports-backdrop-filter:` guard.

### Named Rules

**The Flat-By-Law Rule.** Two elevations exist and no more: flat for anything in the page, `--shadow-overlay` for anything floating above it. If an in-page surface needs to separate, use a tonal step and a hairline — in that order. Never introduce a third value or a shadow scale.

**The Fixed Light Rule.** The atmosphere is binding identity and is capped at its current subtlety. Two layers, both `position: fixed` / `background-attachment: fixed`, both non-scrolling: an ochre radial glow at 7% opacity (`ellipse 80% 50% at 50% -10%`) plus a secondary neutral glow at 6%, and a `body::before` hatch of `repeating-linear-gradient(115deg, oklch(1 0 0 / 1.5%) 0 1px, transparent 1px 10px)` masked by a radial ellipse. **Never intensify these values.** The hatch is 1.5% because it should be felt and not seen; at 5% it becomes a pattern and the room becomes a wallpaper.

## Shapes

A two-radius form language on a 12px base (`--radius: 0.75rem`), with everything else derived by arithmetic:

- **Controls** — 10px (`--radius-md`, `radius - 2px`): buttons, inputs, nav links, icon buttons, chips.
- **Containers** — 12px (`--radius-lg`, the base): the dominant card shape, used in the most common composition `rounded-lg border border-border bg-card`.
- **Feature containers** — 16px (`--radius-card`, `radius + 4px`): larger panels and the BlockNote AI menu.
- **Tight details** — 8px (`--radius-sm`, `radius - 4px`): badges and inline chips.

Borders are always 1px. Depth of a container is expressed by *which* alpha its border and background carry (`border-border` vs `border-border/50`, `bg-card` vs `bg-card/30`), never by radius or shadow.

### Named Rules

**The Two-Radius Rule.** Controls are 10px, containers are 12px. Reach for 8px or 16px only for genuinely tight details and genuinely large panels. Never introduce a square (`0`).

The custom scrollbar thumb is the one radius exception: a 10px rail takes a 5px thumb radius, because a scrollbar is a rail rather than a control or container.

`rounded-full` is reserved for genuinely circular objects — avatars, status dots, spinners, icon buttons whose height and width are equal. It is **not** a badge shape: status, severity, and count badges take the 8px tight-detail radius, so a badge never reads as a pill.

## Components

The component register is **machined and compact**: nothing is larger than it needs to be, and every state change is a color shift. There are no transforms, no scaling, and no press animations anywhere in the system — `transition-colors` is the entire motion vocabulary for controls.

### Buttons

- **Shape:** 10px radius (`rounded-md`), `inline-flex` with 6px icon gap, `font-medium`, tight tracking.
- **Sizes:** `sm` 28px / 10px padding / 12px text · `md` 32px / 12px padding / 13px text (default) · `lg` 40px / 16px padding / 14px text.
- **Primary:** Lamplight Ochre fill, Ink-on-Ochre text, `--shadow-xs`. Hover drops the fill to 90% opacity.
- **Secondary:** Graphite-100 fill with Warm Bone text; hover steps to Graphite-200.
- **Outline:** Hairline border on page-floor background; hover fills to `bg-card/60`.
- **Outline-primary / Outline-danger:** Ochre or Danger border and text on transparent; hover fills the same hue at 10%.
- **Ghost:** Dimmed Bone text, no border; hover fills `bg-card/60` and brightens text to Warm Bone.
- **Danger:** Text-only in Danger-500, darkening to Danger-700 on hover — no fill, no border.
- **Link:** Ochre text with height and horizontal padding forced off.
- **Loading:** The icon slot is replaced by a 14px `border-2` spinner in `currentColor` with a transparent top edge, and `aria-busy` is set. The label never disappears.

### Inputs / Fields

- **Style:** 32px tall, transparent background over a `--color-input` well, hairline border, 10px radius, 13px text, 10px horizontal padding.
- **Focus:** Border shifts to ochre and a 3px ring at 50% ochre appears (`focus-visible:ring-3 ring-ring/50`). Native outlines are suppressed globally in favor of this ring — a focus state must always supply the ring, never nothing.
- **Error:** `aria-invalid` drives a Destructive border plus a 3px destructive ring at 20%.
- **Disabled:** 50% opacity, `not-allowed` cursor, input well fills to 50%.

### Navigation

- **Style:** 10px radius, 12px/6px padding, 14px `font-medium`, `leading-snug`, `transition-colors`.
- **Active:** Ochre wash at 10% with Warm Bone text — the accent appears as a *background tint*, never as a text color or an underline.
- **Idle:** Dimmed Bone text; hover fills to Raised Graphite and brightens text.
- **Container:** Sticky 56px header, `bg-card/30` with `backdrop-blur`, `border-border/40` underline, horizontally scrollable nav strip with hidden scrollbars (`.scrollbar-hide`).

### Cards / Containers

- **Corner style:** 12px (`rounded-lg`), the single most repeated composition being `rounded-lg border border-border bg-card`.
- **Background:** Raised Graphite, or a translucent step (`bg-card/30`, `/40`) when the card should read as a lighter grouping rather than a solid plane.
- **Border:** Always present, always 1px, alpha-modulated (`/40`–`/80`) to express weight.
- **Shadow strategy:** None. See *Elevation & Depth*.
- **Internal padding:** 16px (`--space-panel`).

### Dense Data Table

The signature surface of the product. `.table-compact` sets 8px/12px cell padding at 13px, with a head that is 12px, uppercase, and letter-spaced at 0.04em. It is the only uppercase in the system, and it is what makes a full scan result readable in one screen.

### Custom Scrollbars

Global and deliberate: 10px wide, `thin` via `scrollbar-width`, thumb in ochre at 35% with a 2px transparent border and `background-clip: padding-box` producing an inset rail, brightening to 55% on hover. Track and corner are fully transparent. This is a small thing users see constantly and it is part of the identity.

### Expanding Search Field

`.input-enlarge-wrap` grows from 16rem to 22rem on `focus-within` over 0.32s with an overshoot easing (`cubic-bezier(0.34, 1.2, 0.64, 1)`) — the one place in the system where motion has personality. It is correctly disabled under `prefers-reduced-motion`, as is the 40s `marquee` animation. Any new motion must ship with the same guard.

## Do's and Don'ts

### Do:

- **Do** carry every neutral in the warm family (hue 50–60, chroma ≤0.012). A true gray is instantly foreign here.
- **Do** express hierarchy with a tonal step plus a hairline `Filament Line` border, in that order.
- **Do** keep Lamplight Ochre under ~10% of any screen, and only on interaction, focus, active state, or series-1.
- **Do** use the 13px label size as the default for UI text — buttons, inputs, table cells, nav. It is the workhorse.
- **Do** pair every focus state with the 3px ochre ring; native outlines are globally suppressed, so omitting the ring leaves the control with no focus affordance at all.
- **Do** verify both themes. Dark is the default and light is a full override — a value that only works in one is a bug.
- **Do** rely on the global `prefers-reduced-motion` floor in `index.css`, which neutralizes every entrance, exit, and pulse. Loading spinners are deliberately exempt and merely slow to 1.8s, because they report work still in flight.
- **Do** close the responsive gap at `md:` when touching a layout — phone-width support is a product requirement, and current coverage is thin.

### Don't:

- **Don't** add a shadow scale. There is one `--shadow-xs` and it is not a hierarchy tool.
- **Don't** exceed 22px on any text. CSS enforces this with `!important`; a larger utility class will simply be overridden.
- **Don't** intensify the atmosphere. The hatch stays at 1.5% and the glow at 7% — they are meant to be felt, not seen.
- **Don't** reintroduce the legacy berry, dusk, cream, or seed scales as primary surfaces. They are severity and marketing accents only.
- **Don't** use pill (`9999px`) or square (`0`) radii. Controls are 10px, containers are 12px.
- **Don't** add transforms, scaling, or press animations to controls. State is communicated through color alone.
- **Don't** introduce a second typeface, including a monospace family for code. Code is distinguished by surface and token color.
- **Don't** put Warm Bone text on an ochre fill — ochre carries Ink-on-Ochre (`oklch(0.18 0.01 50)`).
- **Don't** invent a shadow utility. `shadow-lg`, `shadow-xl`, `shadow-md` and ad-hoc values are banned; overlays use `shadow-(--shadow-overlay)` and nothing else.
- **Don't** use `rounded-full` on anything with horizontal padding. If it has `px-`, it is a badge, and badges are 8px.
- **Don't** put white text on a solid ochre fill — `oklch(0.78 0.08 70)` against `#fff` is about 1.75:1. Ochre carries `text-primary-foreground`.
