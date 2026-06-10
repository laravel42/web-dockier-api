export interface DetectedService {
  type: "database" | "cache" | "queue" | "storage" | "search" | "mail" | "broadcasting" | "scheduler";
  name: string;
  provider: string;
  confidence: number;
  configFile?: string;
}

interface ServiceDetector {
  filePattern: RegExp;
  service: Omit<DetectedService, "confidence"> & { confidence?: number };
}

const SERVICE_DETECTORS: ServiceDetector[] = [
  { filePattern: /config\/database\.php$/i, service: { type: "database", name: "MySQL/PostgreSQL", provider: "Laravel DB" } },
  { filePattern: /prisma\/schema\.prisma$/i, service: { type: "database", name: "PostgreSQL", provider: "Prisma" } },
  { filePattern: /migrations?\//i, service: { type: "database", name: "SQL Database", provider: "Migrations", confidence: 80 } },
  { filePattern: /redis/i, service: { type: "cache", name: "Redis", provider: "Redis", confidence: 70 } },
  { filePattern: /config\/queue\.php$/i, service: { type: "queue", name: "Redis/SQS/Database", provider: "Laravel Queue" } },
  { filePattern: /celery|bullmq|sidekiq|rabbitmq/i, service: { type: "queue", name: "Queue Worker", provider: "Queue Runtime", confidence: 75 } },
  { filePattern: /config\/filesystems\.php$|uploads?\//i, service: { type: "storage", name: "Object/File Storage", provider: "Filesystem", confidence: 70 } },
  { filePattern: /elasticsearch|meilisearch|typesense/i, service: { type: "search", name: "Search Engine", provider: "Search Service", confidence: 70 } },
  { filePattern: /config\/mail\.php$|nodemailer|sendgrid|mailgun|postmark/i, service: { type: "mail", name: "Transactional Email", provider: "Mail Service", confidence: 70 } },
  { filePattern: /config\/broadcasting\.php$|socket\.io|pusher|ably/i, service: { type: "broadcasting", name: "Realtime Broadcasting", provider: "Broadcasting", confidence: 70 } },
  { filePattern: /app\/Console\/Kernel\.php$|cron/i, service: { type: "scheduler", name: "Task Scheduler", provider: "Cron/Scheduler", confidence: 65 } },
];

export function detectServices(files: string[]): DetectedService[] {
  const found = new Map<string, DetectedService>();
  for (const file of files) {
    for (const detector of SERVICE_DETECTORS) {
      if (!detector.filePattern.test(file)) continue;
      const key = `${detector.service.type}:${detector.service.name}`;
      const nextConfidence = detector.service.confidence ?? 90;
      const current = found.get(key);
      if (!current || nextConfidence > current.confidence) {
        found.set(key, {
          type: detector.service.type,
          name: detector.service.name,
          provider: detector.service.provider,
          confidence: nextConfidence,
          configFile: file,
        });
      }
    }
  }

  const byType = new Map<DetectedService["type"], DetectedService>();
  for (const service of found.values()) {
    const current = byType.get(service.type);
    if (!current || service.confidence > current.confidence) {
      byType.set(service.type, service);
    }
  }
  return Array.from(byType.values()).sort((a, b) => b.confidence - a.confidence);
}
