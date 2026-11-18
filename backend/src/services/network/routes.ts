import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getAuth } from "../../shared/auth/auth.js";
import { PERMISSIONS } from "../../shared/permissions/constants.js";
import { successResponseSchema } from "../../shared/schemas/responses.js";
import {
  securityRuleSchema,
  createSecurityRuleBodySchema,
  addCredentialBodySchema,
  redirectRuleSchema,
  createRedirectRuleBodySchema,
} from "./schemas.js";
import {
  listSecurityRules,
  createSecurityRule,
  deleteSecurityRule,
  addSecurityRuleCredential,
  deleteSecurityRuleCredential,
  listRedirectRules,
  createRedirectRule,
  deleteRedirectRule,
} from "./domain/network.js";
import { applyNetworkRules } from "./domain/applier.js";
import { safeRecordActivity } from "../../shared/service-clients/activity.js";

/** Where a Basic Auth rule applies, for an activity line. */
const rulePlace = (path: string | null | undefined) => (path ? ` on ${path}` : " on the whole site");
import { enqueueNetworkApply } from "../../shared/workers/config-apply.js";

export async function registerNetworkRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── Security Rules ───

  typed.get(
    "/projects/:projectId/network/security-rules",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["network"],
        summary: "List security rules for a project",
        params: z.object({ projectId: z.uuid() }),
        response: {
          200: z.object({ rules: z.array(securityRuleSchema) }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const rules = await listSecurityRules({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
      return { rules };
    },
  );

  typed.post(
    "/projects/:projectId/network/security-rules",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["network"],
        summary: "Create a security rule",
        params: z.object({ projectId: z.uuid() }),
        body: createSecurityRuleBodySchema,
        response: { 200: securityRuleSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const rule = await createSecurityRule({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        name: request.body.name,
        path: request.body.path,
        credentials: request.body.credentials,
      });
      await enqueueNetworkApply(auth.tenantId, request.params.projectId);
      safeRecordActivity({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        userId: auth.userId,
        eventType: "security_rule_added",
        description: `Added Basic Auth rule "${rule.name}"${rulePlace(rule.path)}`,
      });
      return rule;
    },
  );

  typed.delete(
    "/projects/:projectId/network/security-rules/:ruleId",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["network"],
        summary: "Delete a security rule",
        params: z.object({
          projectId: z.uuid(),
          ruleId: z.uuid(),
        }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const removed = await deleteSecurityRule({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        ruleId: request.params.ruleId,
      });
      await enqueueNetworkApply(auth.tenantId, request.params.projectId);
      safeRecordActivity({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        userId: auth.userId,
        eventType: "security_rule_removed",
        description: `Removed Basic Auth rule "${removed.name}"${rulePlace(removed.path)}`,
      });
      return { success: true as const };
    },
  );

  typed.post(
    "/projects/:projectId/network/security-rules/:ruleId/credentials",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["network"],
        summary: "Add a credential to a security rule",
        params: z.object({
          projectId: z.uuid(),
          ruleId: z.uuid(),
        }),
        body: addCredentialBodySchema,
        response: {
          200: z.object({
            id: z.uuid(),
            username: z.string(),
            createdAt: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const { credential, ruleName } = await addSecurityRuleCredential({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        ruleId: request.params.ruleId,
        username: request.body.username,
        password: request.body.password,
      });
      await enqueueNetworkApply(auth.tenantId, request.params.projectId);
      // Who can get in changed: the line an audit of a break-in looks for.
      safeRecordActivity({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        userId: auth.userId,
        eventType: "security_rule_user_added",
        description: `Added user "${credential.username}" to Basic Auth rule "${ruleName}"`,
      });
      return credential;
    },
  );

  typed.delete(
    "/projects/:projectId/network/security-rules/:ruleId/credentials/:credentialId",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["network"],
        summary: "Delete a credential from a security rule",
        params: z.object({
          projectId: z.uuid(),
          ruleId: z.uuid(),
          credentialId: z.uuid(),
        }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const removed = await deleteSecurityRuleCredential({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        ruleId: request.params.ruleId,
        credentialId: request.params.credentialId,
      });
      await enqueueNetworkApply(auth.tenantId, request.params.projectId);
      safeRecordActivity({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        userId: auth.userId,
        eventType: "security_rule_user_removed",
        description: `Removed user "${removed.username}" from Basic Auth rule "${removed.ruleName}"`,
      });
      return { success: true as const };
    },
  );

  // ─── Redirect Rules ───

  typed.get(
    "/projects/:projectId/network/redirect-rules",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_VIEW),
      schema: {
        tags: ["network"],
        summary: "List redirect rules for a project",
        params: z.object({ projectId: z.uuid() }),
        response: {
          200: z.object({ rules: z.array(redirectRuleSchema) }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const rules = await listRedirectRules({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
      return { rules };
    },
  );

  typed.post(
    "/projects/:projectId/network/redirect-rules",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["network"],
        summary: "Create a redirect rule",
        params: z.object({ projectId: z.uuid() }),
        body: createRedirectRuleBodySchema,
        response: { 200: redirectRuleSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const rule = await createRedirectRule({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        fromPath: request.body.fromPath,
        toPath: request.body.toPath,
        type: request.body.type,
      });
      await enqueueNetworkApply(auth.tenantId, request.params.projectId);
      safeRecordActivity({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        userId: auth.userId,
        eventType: "redirect_added",
        description: `Added redirect ${rule.fromPath} → ${rule.toPath}`,
      });
      return rule;
    },
  );

  typed.delete(
    "/projects/:projectId/network/redirect-rules/:ruleId",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
      schema: {
        tags: ["network"],
        summary: "Delete a redirect rule",
        params: z.object({
          projectId: z.uuid(),
          ruleId: z.uuid(),
        }),
        response: { 200: successResponseSchema },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      const removed = await deleteRedirectRule({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        ruleId: request.params.ruleId,
      });
      await enqueueNetworkApply(auth.tenantId, request.params.projectId);
      safeRecordActivity({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
        userId: auth.userId,
        eventType: "redirect_removed",
        description: `Removed redirect ${removed.fromPath} → ${removed.toPath}`,
      });
      return { success: true as const };
    },
  );

  // ─── Manual Apply ───

  typed.post(
    "/projects/:projectId/network/apply",
    {
      preHandler: app.requireProjectPermission(PERMISSIONS.PROJECT_MANAGE),
      handlerTimeout: 45_000,
      schema: {
        tags: ["network"],
        summary: "Apply all network rules to the deployed server",
        params: z.object({ projectId: z.uuid() }),
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
            generatedConfig: z.string().optional(),
          }),
        },
      },
    },
    async (request) => {
      const auth = getAuth(request);
      return await applyNetworkRules({
        tenantId: auth.tenantId,
        projectId: request.params.projectId,
      });
    },
  );
}
