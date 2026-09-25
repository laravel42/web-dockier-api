export interface DetectedService {
  type: "database" | "cache" | "queue" | "storage" | "search" | "mail" | "broadcasting" | "scheduler";
  name: string;
  provider: string;
  confidence: number;
  configFile?: string;
}

/** Minimal shape of a scanned dependency this module needs. */
export interface DependencyRef {
  name: string;
  ecosystem: string;
}

interface FileDetector {
  filePattern: RegExp;
  service: Omit<DetectedService, "confidence"> & { confidence?: number };
}

/**
 * File-path detectors. These are matched against the repo file tree, so every
 * pattern MUST be anchored to a concrete, framework-specific location. Loose
 * substring rules (e.g. bare `redis` or `migrations/`) produced false positives
 * — a static Astro site with a `src/migrations/` content folder or any vendored
 * path containing "redis" was reported as needing a Database and a Cache. Anchor
 * every pattern to a real config file or a conventional migrations directory.
 */
const FILE_DETECTORS: FileDetector[] = [
  { filePattern: /(^|\/)config\/database\.php$/i, service: { type: "database", name: "MySQL/PostgreSQL", provider: "Laravel DB" } },
  { filePattern: /(^|\/)prisma\/schema\.prisma$/i, service: { type: "database", name: "PostgreSQL", provider: "Prisma" } },
  // Conventional DB migration directories only — not any path containing the word.
  { filePattern: /(^|\/)(db|database|prisma|drizzle|migrations?)\/migrations?\//i, service: { type: "database", name: "SQL Database", provider: "Migrations", confidence: 80 } },
  { filePattern: /(^|\/)config\/queue\.php$/i, service: { type: "queue", name: "Redis/SQS/Database", provider: "Laravel Queue" } },
  { filePattern: /(^|\/)config\/filesystems\.php$/i, service: { type: "storage", name: "Object/File Storage", provider: "Filesystem", confidence: 70 } },
  { filePattern: /(^|\/)config\/mail\.php$/i, service: { type: "mail", name: "Transactional Email", provider: "Mail Service", confidence: 70 } },
  { filePattern: /(^|\/)config\/broadcasting\.php$/i, service: { type: "broadcasting", name: "Realtime Broadcasting", provider: "Broadcasting", confidence: 70 } },
  { filePattern: /(^|\/)app\/Console\/Kernel\.php$/i, service: { type: "scheduler", name: "Task Scheduler", provider: "Cron/Scheduler", confidence: 65 } },
];

interface DependencyDetector {
  /** Matched against a dependency's package name (case-insensitive). */
  pattern: RegExp;
  service: Omit<DetectedService, "confidence"> & { confidence?: number };
}

/**
 * Dependency-name detectors. A declared dependency is a far stronger signal than
 * a filename: a project that installs `ioredis`, `bull`, or `@elastic/elasticsearch`
 * genuinely talks to that service, whereas a matching filename is often incidental.
 */
const DEPENDENCY_DETECTORS: DependencyDetector[] = [
  // Database drivers / ORMs.
  { pattern: /^(pg|postgres|mysql2?|mariadb|sqlite3|better-sqlite3|@prisma\/client|prisma|drizzle-orm|typeorm|sequelize|mongoose|mongodb|knex)$/i, service: { type: "database", name: "SQL/NoSQL Database", provider: "Database Driver", confidence: 90 } },
  { pattern: /^(psycopg2(-binary)?|sqlalchemy|django|asyncpg|pymysql|mysqlclient|peewee)$/i, service: { type: "database", name: "SQL Database", provider: "Database Driver", confidence: 90 } },
  // Cache / Redis clients.
  { pattern: /^(redis|ioredis|@redis\/client|node-redis)$/i, service: { type: "cache", name: "Redis", provider: "Redis", confidence: 90 } },
  { pattern: /^(predis\/predis|memcached|@memcached\/client)$/i, service: { type: "cache", name: "Cache", provider: "Cache Client", confidence: 85 } },
  // Queue runtimes.
  { pattern: /^(bull|bullmq|bee-queue|agenda|kue|celery|sidekiq|amqplib|rabbitmq|@aws-sdk\/client-sqs)$/i, service: { type: "queue", name: "Queue Worker", provider: "Queue Runtime", confidence: 85 } },
  // Search engines.
  { pattern: /^(@elastic\/elasticsearch|elasticsearch|meilisearch|typesense|@algolia\/client-search|algoliasearch)$/i, service: { type: "search", name: "Search Engine", provider: "Search Service", confidence: 85 } },
  // Object storage.
  { pattern: /^(@aws-sdk\/client-s3|aws-sdk|@google-cloud\/storage|minio|multer-s3)$/i, service: { type: "storage", name: "Object Storage", provider: "Storage SDK", confidence: 80 } },
  // Transactional mail.
  { pattern: /^(nodemailer|@sendgrid\/mail|sendgrid|mailgun\.js|mailgun-js|postmark|@aws-sdk\/client-ses|resend)$/i, service: { type: "mail", name: "Transactional Email", provider: "Mail Service", confidence: 80 } },
  // Realtime broadcasting.
  { pattern: /^(socket\.io|pusher|@ably\/[\w-]+|ably|@pusher\/[\w-]+)$/i, service: { type: "broadcasting", name: "Realtime Broadcasting", provider: "Broadcasting", confidence: 80 } },
];

/**
 * Detect the backing services a repository needs.
 *
 * Detection combines two signals:
 *   1. Declared dependencies (strongest — a project installs a client for a
 *      service it actually uses).
 *   2. Anchored, framework-specific config/migration files.
 *
 * A project with neither signal (e.g. a static Astro site) reports no services,
 * which is the correct result.
 */
export function detectServices(files: string[], dependencies: DependencyRef[] = []): DetectedService[] {
  const found = new Map<string, DetectedService>();

  const record = (service: DetectedService) => {
    const key = `${service.type}:${service.name}`;
    const current = found.get(key);
    if (!current || service.confidence > current.confidence) {
      found.set(key, service);
    }
  };

  for (const dep of dependencies) {
    for (const detector of DEPENDENCY_DETECTORS) {
      if (!detector.pattern.test(dep.name)) continue;
      record({
        type: detector.service.type,
        name: detector.service.name,
        provider: detector.service.provider,
        confidence: detector.service.confidence ?? 90,
        configFile: `${dep.ecosystem}:${dep.name}`,
      });
    }
  }

  for (const file of files) {
    for (const detector of FILE_DETECTORS) {
      if (!detector.filePattern.test(file)) continue;
      record({
        type: detector.service.type,
        name: detector.service.name,
        provider: detector.service.provider,
        confidence: detector.service.confidence ?? 90,
        configFile: file,
      });
    }
  }

  // Collapse to the highest-confidence service per type.
  const byType = new Map<DetectedService["type"], DetectedService>();
  for (const service of found.values()) {
    const current = byType.get(service.type);
    if (!current || service.confidence > current.confidence) {
      byType.set(service.type, service);
    }
  }
  return Array.from(byType.values()).sort((a, b) => b.confidence - a.confidence);
}
