import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { env } from "./config.js";

export async function registerPlatformPlugins(app: FastifyInstance, serviceName: string) {
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(sensible);
  await app.register(swagger, {
    openapi: {
      info: {
        title: `Dockier ${serviceName} API`,
        version: "0.1.0",
        description: "Fastify migration target for Dockier services.",
      },
      servers: [{ url: "/" }],
      tags: [
        { name: "migration", description: "Migration tracking endpoints" },
        { name: "auth", description: "Passwordless auth, tenant memberships, and RBAC sessions" },
        { name: "users", description: "User profile management" },
        { name: "projects", description: "Project CRUD and configuration" },
        { name: "roles", description: "Role definitions and permission groups" },
        { name: "deploy", description: "Cloud provider setup and deployment lifecycle" },
        { name: "notifications", description: "Notification channels and in-app notifications" },
        { name: "integrations", description: "Project management integrations" },
        { name: "code-analysis", description: "Security scans, findings, and rule management" },
        { name: "git-integration", description: "Git provider connections and repository intelligence" },
        { name: "image-builder", description: "Build orchestration and image/deploy status" },
      ],
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    staticCSP: true,
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });
}
