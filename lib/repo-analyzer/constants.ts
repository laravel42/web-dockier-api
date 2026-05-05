import type { NativeDep } from "./types";

export const NATIVE_DEPS_MAP: Record<string, Omit<NativeDep, "name">> = {
  // Node.js native deps
  "sharp": { aptPackages: ["libvips-dev"], alpinePackages: ["vips-dev"], reason: "Image processing (libvips)" },
  "canvas": { aptPackages: ["libcairo2-dev", "libjpeg-dev", "libpango1.0-dev", "libgif-dev", "librsvg2-dev"], alpinePackages: ["cairo-dev", "jpeg-dev", "pango-dev", "giflib-dev", "librsvg-dev"], reason: "Canvas rendering (Cairo)" },
  "bcrypt": { aptPackages: ["python3", "make", "g++"], alpinePackages: ["python3", "make", "g++"], reason: "Native bcrypt hashing" },
  "argon2": { aptPackages: ["make", "g++"], alpinePackages: ["make", "g++"], reason: "Argon2 password hashing" },
  "better-sqlite3": { aptPackages: ["python3", "make", "g++"], alpinePackages: ["python3", "make", "g++"], reason: "SQLite native bindings" },
  "sqlite3": { aptPackages: ["python3", "make", "g++"], alpinePackages: ["python3", "make", "g++"], reason: "SQLite native bindings" },
  "pg-native": { aptPackages: ["libpq-dev"], alpinePackages: ["postgresql-dev"], reason: "PostgreSQL native client" },
  "node-gyp": { aptPackages: ["python3", "make", "g++"], alpinePackages: ["python3", "make", "g++"], reason: "Native addon compilation" },
  "puppeteer": { aptPackages: ["chromium", "libx11-xcb1", "libxcomposite1", "libxdamage1", "libxi6", "libxtst6", "libnss3", "libcups2", "libxss1", "libxrandr2", "libasound2", "libpangocairo-1.0-0", "libatk1.0-0", "libatk-bridge2.0-0", "libgtk-3-0"], alpinePackages: ["chromium", "nss", "freetype", "harfbuzz", "ca-certificates", "ttf-freefont"], reason: "Headless Chrome" },
  "playwright": { aptPackages: ["libnss3", "libnspr4", "libatk1.0-0", "libatk-bridge2.0-0", "libcups2", "libdrm2", "libxkbcommon0", "libxcomposite1", "libxdamage1", "libxfixes3", "libxrandr2", "libgbm1", "libpango-1.0-0", "libcairo2", "libasound2"], alpinePackages: [], reason: "Browser automation" },
  "libsql": { aptPackages: ["python3", "make", "g++"], alpinePackages: ["python3", "make", "g++"], reason: "LibSQL native bindings" },
  "@mapbox/node-pre-gyp": { aptPackages: ["python3", "make", "g++"], alpinePackages: ["python3", "make", "g++"], reason: "Native addon pre-built binaries" },
  "esbuild": { aptPackages: [], alpinePackages: [], reason: "Go-based bundler (ships prebuilt)" },
  "lightningcss": { aptPackages: [], alpinePackages: [], reason: "Rust-based CSS (ships prebuilt)" },
  // PHP native deps (composer packages → PHP extensions)
  "ext-gd": { aptPackages: ["libpng-dev", "libjpeg-dev", "libfreetype6-dev"], alpinePackages: ["libpng-dev", "libjpeg-turbo-dev", "freetype-dev"], reason: "GD image library" },
  "ext-imagick": { aptPackages: ["libmagickwand-dev"], alpinePackages: ["imagemagick-dev"], reason: "ImageMagick" },
  "ext-pgsql": { aptPackages: ["libpq-dev"], alpinePackages: ["postgresql-dev"], reason: "PostgreSQL extension" },
  "ext-redis": { aptPackages: [], alpinePackages: [], reason: "Redis extension (PECL)" },
  "ext-zip": { aptPackages: ["libzip-dev"], alpinePackages: ["libzip-dev"], reason: "ZIP extension" },
  "ext-intl": { aptPackages: ["libicu-dev"], alpinePackages: ["icu-dev"], reason: "Internationalization" },
  "ext-soap": { aptPackages: ["libxml2-dev"], alpinePackages: ["libxml2-dev"], reason: "SOAP extension" },
  "ext-bcmath": { aptPackages: [], alpinePackages: [], reason: "BCMath (built-in)" },
  "ext-pcntl": { aptPackages: [], alpinePackages: [], reason: "Process control (built-in)" },
};
