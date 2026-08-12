#!/usr/bin/env node
/**
 * Writes the list of icons present in public/devicons into a TS module so the
 * app can tell, without a network round trip, whether a tech badge has an icon.
 *
 * Runs from `dev` and `build`, so the manifest cannot drift from the folder.
 */
import { readdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(here, "..", "public", "devicons");
const outFile = join(here, "..", "src", "data", "devicon-manifest.ts");

const names = readdirSync(iconsDir)
  .filter((file) => file.toLowerCase().endsWith(".svg"))
  .map((file) => file.slice(0, -".svg".length))
  .sort((a, b) => a.localeCompare(b));

const contents = `// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/generate-devicon-manifest.mjs
//
// Icon filenames present in public/devicons (without the .svg extension).
// Tech-stack badges consult this so a stack with no icon is dropped rather than
// rendered as a chip with an empty slot where the icon should be.

export const DEVICON_FILES: ReadonlySet<string> = new Set([
${names.map((name) => `  ${JSON.stringify(name)},`).join("\n")}
]);
`;

// Avoid rewriting an identical file so dev servers don't reload for nothing.
if (!existsSync(outFile) || readFileSync(outFile, "utf8") !== contents) {
  writeFileSync(outFile, contents);
  console.log(`devicon manifest: ${names.length} icons -> src/data/devicon-manifest.ts`);
} else {
  console.log(`devicon manifest: up to date (${names.length} icons)`);
}
