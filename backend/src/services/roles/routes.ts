import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { staticRoles } from "./data.js";
import { roleSchema } from "./schemas.js";
import { membershipRoleSchemaValues } from "../../shared/auth.js";

export async function registerRolesRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/roles",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["roles"],
        summary: "List roles",
        response: { 200: z.object({ roles: z.array(roleSchema) }) },
      },
    },
    async () => ({ roles: staticRoles }),
  );

  typed.get(
    "/roles/:roleId",
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ["roles"],
        summary: "Get role",
        params: z.object({ roleId: z.enum(membershipRoleSchemaValues) }),
        response: { 200: roleSchema },
      },
    },
    async (request) => {
      const role = staticRoles.find((item) => item.id === request.params.roleId);
      if (!role) throw app.httpErrors.notFound("Role not found");
      return role;
    },
  );
}
