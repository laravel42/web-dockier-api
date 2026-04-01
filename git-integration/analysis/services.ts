export interface DetectedService {
  type: "database" | "cache" | "queue" | "storage" | "search" | "mail" | "broadcasting" | "scheduler";
  name: string;
  provider: string;
  confidence: number;
  configFile?: string;
}

// ─── Service Detection Rules ───

interface ServiceDetector {
  filePattern?: RegExp;
  contentPattern?: RegExp;
  service: Omit<DetectedService, "confidence"> & { confidence?: number };
}

const SERVICE_DETECTORS: ServiceDetector[] = [
  // ── Database ──
  { filePattern: /config\/database\.php$/i, service: { type: "database", name: "MySQL/PostgreSQL", provider: "Laravel DB" } },
  { filePattern: /prisma\/schema\.prisma$/i, service: { type: "database", name: "PostgreSQL", provider: "Prisma" } },
  { filePattern: /drizzle\.config\./i, service: { type: "database", name: "PostgreSQL", provider: "Drizzle ORM" } },
  { filePattern: /knexfile\./i, service: { type: "database", name: "PostgreSQL", provider: "Knex.js" } },
  { filePattern: /sequelize/i, service: { type: "database", name: "PostgreSQL/MySQL", provider: "Sequelize" } },
  { filePattern: /typeorm/i, service: { type: "database", name: "PostgreSQL/MySQL", provider: "TypeORM" } },
  { filePattern: /migrations?\//i, service: { type: "database", name: "SQL Database", provider: "Migrations", confidence: 80 } },
  { filePattern: /\.sql$/i, service: { type: "database", name: "SQL Database", provider: "SQL Files", confidence: 60 } },
  { filePattern: /mongod|mongoose/i, service: { type: "database", name: "MongoDB", provider: "MongoDB" } },
  { filePattern: /settings\.py$/i, service: { type: "database", name: "PostgreSQL", provider: "Django ORM", confidence: 70 } },
  { filePattern: /config\/database\.yml$/i, service: { type: "database", name: "PostgreSQL", provider: "Rails ActiveRecord" } },
  { filePattern: /alembic/i, service: { type: "database", name: "PostgreSQL", provider: "Alembic (SQLAlchemy)" } },
  // ── Cache ──
  { filePattern: /config\/cache\.php$/i, service: { type: "cache", name: "Redis/Memcached", provider: "Laravel Cache" } },
  { filePattern: /redis/i, service: { type: "cache", name: "Redis", provider: "Redis", confidence: 70 } },
  { filePattern: /memcached/i, service: { type: "cache", name: "Memcached", provider: "Memcached" } },
  // ── Queue ──
  { filePattern: /config\/queue\.php$/i, service: { type: "queue", name: "Redis/SQS/Database", provider: "Laravel Queue" } },
  { filePattern: /config\/horizon\.php$/i, service: { type: "queue", name: "Redis Queue", provider: "Laravel Horizon" } },
  { filePattern: /app\/Jobs\//i, service: { type: "queue", name: "Queue Worker", provider: "Laravel Jobs" } },
  { filePattern: /celery/i, service: { type: "queue", name: "Celery", provider: "Celery (Python)" } },
  { filePattern: /bullmq|bull\//i, service: { type: "queue", name: "BullMQ", provider: "BullMQ (Node.js)" } },
  { filePattern: /sidekiq/i, service: { type: "queue", name: "Sidekiq", provider: "Sidekiq (Ruby)" } },
  { filePattern: /rabbitmq/i, service: { type: "queue", name: "RabbitMQ", provider: "RabbitMQ" } },
  // ── Storage ──
  { filePattern: /config\/filesystems\.php$/i, service: { type: "storage", name: "S3/Local", provider: "Laravel Filesystem" } },
  { filePattern: /storage\/app\//i, service: { type: "storage", name: "File Storage", provider: "Local Storage", confidence: 60 } },
  { filePattern: /aws-sdk|@aws-sdk\/client-s3/i, service: { type: "storage", name: "S3", provider: "AWS S3" } },
  { filePattern: /minio/i, service: { type: "storage", name: "MinIO/S3", provider: "MinIO" } },
  { filePattern: /uploads?\//i, service: { type: "storage", name: "File Uploads", provider: "Upload Directory", confidence: 50 } },
  // ── Search ──
  { filePattern: /config\/scout\.php$/i, service: { type: "search", name: "Algolia/Meilisearch", provider: "Laravel Scout" } },
  { filePattern: /elasticsearch|elastic/i, service: { type: "search", name: "Elasticsearch", provider: "Elasticsearch" } },
  { filePattern: /meilisearch/i, service: { type: "search", name: "Meilisearch", provider: "Meilisearch" } },
  { filePattern: /typesense/i, service: { type: "search", name: "Typesense", provider: "Typesense" } },
  // ── Mail ──
  { filePattern: /config\/mail\.php$/i, service: { type: "mail", name: "SMTP/Mailgun/SES", provider: "Laravel Mail" } },
  { filePattern: /app\/Mail\//i, service: { type: "mail", name: "Transactional Email", provider: "Laravel Mailable" } },
  { filePattern: /resources\/views\/(?:emails|mail)\//i, service: { type: "mail", name: "Email Templates", provider: "Email Views" } },
  { filePattern: /nodemailer/i, service: { type: "mail", name: "SMTP", provider: "Nodemailer" } },
  { filePattern: /sendgrid/i, service: { type: "mail", name: "SendGrid", provider: "SendGrid" } },
  { filePattern: /mailgun/i, service: { type: "mail", name: "Mailgun", provider: "Mailgun" } },
  { filePattern: /postmark/i, service: { type: "mail", name: "Postmark", provider: "Postmark" } },
  // ── Broadcasting ──
  { filePattern: /config\/broadcasting\.php$/i, service: { type: "broadcasting", name: "Pusher/Redis/Ably", provider: "Laravel Broadcasting" } },
  { filePattern: /pusher/i, service: { type: "broadcasting", name: "Pusher", provider: "Pusher" } },
  { filePattern: /socket\.io|socketio/i, service: { type: "broadcasting", name: "Socket.IO", provider: "Socket.IO" } },
  { filePattern: /laravel-echo/i, service: { type: "broadcasting", name: "Laravel Echo", provider: "Laravel Echo" } },
  { filePattern: /ably/i, service: { type: "broadcasting", name: "Ably", provider: "Ably" } },
  // ── Scheduler / Cron ──
  { filePattern: /app\/Console\/Kernel\.php$/i, service: { type: "scheduler", name: "Task Scheduler", provider: "Laravel Scheduler" } },
  { filePattern: /crontab|cron/i, service: { type: "scheduler", name: "Cron Jobs", provider: "Cron", confidence: 60 } },
  { filePattern: /node-cron|agenda/i, service: { type: "scheduler", name: "Scheduled Tasks", provider: "Node Cron" } },
];

export function detectServices(files: string[]): DetectedService[] {
  const found = new Map<string, DetectedService>();
  for (const file of files) {
    for (const det of SERVICE_DETECTORS) {
      if (det.filePattern && det.filePattern.test(file)) {
        const key = `${det.service.type}:${det.service.name}`;
        if (!found.has(key) || (det.service.confidence ?? 90) > (found.get(key)!.confidence)) {
          found.set(key, {
            type: det.service.type,
            name: det.service.name,
            provider: det.service.provider,
            confidence: det.service.confidence ?? 90,
            configFile: file,
          });
        }
      }
    }
  }
  // Deduplicate by type — keep highest confidence per type
  const byType = new Map<string, DetectedService[]>();
  for (const svc of found.values()) {
    const arr = byType.get(svc.type) || [];
    arr.push(svc);
    byType.set(svc.type, arr);
  }
  const result: DetectedService[] = [];
  for (const [, svcs] of byType) {
    svcs.sort((a, b) => b.confidence - a.confidence);
    // Keep the top entry per type, but merge names if multiple high-confidence
    const top = svcs[0];
    if (svcs.length > 1 && svcs[1].confidence >= 70 && svcs[1].name !== top.name) {
      top.name = `${top.name} + ${svcs[1].name}`;
    }
    result.push(top);
  }
  return result.sort((a, b) => b.confidence - a.confidence);
}
