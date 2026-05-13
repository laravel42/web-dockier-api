import type { FastifyInstance } from "fastify";
import { z } from "zod";

export const remainingServices = [] as const;

export async function registerMigrationStatusRoute(app: FastifyInstance, serviceName: string) {
  app.get(
    "/_migration/status",
    {
      schema: {
        tags: ["migration"],
        summary: "Migration progress for this service",
        response: {
          200: z.object({
            service: z.string(),
            status: z.enum(["migrated", "scaffolded"]),
            notes: z.array(z.string()),
          }),
        },
      },
    },
    async () => ({
      service: serviceName,
      status: "migrated" as const,
      notes: [
        "Fastify service endpoints are implemented with typed route schemas.",
        "This status endpoint is retained for migration observability.",
      ],
    }),
  );
}
