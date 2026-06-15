import { z } from "zod";

export const findingSeveritySchema = z.enum(["error", "warning", "info"]);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

export const findingSchema = z.object({
  id: z.string().uuid(),
  scanId: z.string().uuid(),
  ruleId: z.string(),
  severity: findingSeveritySchema,
  message: z.string(),
  filePath: z.string(),
  startLine: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
  snippet: z.string(),
  createdAt: z.string(),
});

export const scanProgressSchema = z.object({
  phase: z.string(),
  filesScanned: z.number().int().nonnegative(),
  filesInRepo: z.number().int().nonnegative(),
  findingsCount: z.number().int().nonnegative(),
  currentFile: z.string().optional(),
  currentRule: z.string().optional(),
  scanner: z.string().optional(),
  rulesChecked: z.number().int().nonnegative().optional(),
  rulesTotal: z.number().int().nonnegative().optional(),
});

export const summarySchema = z.object({
  totalFindings: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  infos: z.number().int().nonnegative(),
  filesScanned: z.number().int().nonnegative(),
  filesInRepo: z.number().int().nonnegative(),
  error: z.string().optional(),
  progress: scanProgressSchema.optional(),
});

export const scanStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

export type ScanStatus = z.infer<typeof scanStatusSchema>;

export const scanSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  connectionId: z.string(),
  repo: z.string(),
  branch: z.string(),
  status: scanStatusSchema,
  summary: summarySchema,
  commitSha: z.string(),
  commitMessage: z.string(),
  commitAuthor: z.string(),
  commitDate: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const customRuleSchema = z.object({
  id: z.string().uuid(),
  ruleId: z.string(),
  severity: z.string(),
  message: z.string(),
  pattern: z.string(),
  extensions: z.array(z.string()),
  enabled: z.boolean(),
  isSystem: z.boolean(),
  type: z.string(),
  yamlContent: z.string(),
  createdAt: z.string(),
});
