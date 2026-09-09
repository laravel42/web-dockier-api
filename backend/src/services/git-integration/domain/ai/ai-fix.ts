/**
 * AI-powered security finding remediation using OpenAI.
 */

import { logger } from "../../../../shared/logger.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";

export interface GenerateCodeFixInput {
  filePath: string;
  fileContent: string;
  startLine: number;
  endLine: number;
  ruleId: string;
  severity: string;
  message: string;
  snippet: string;
}

export interface GenerateCodeFixResult {
  fixedContent: string;
  summary: string;
}

interface CodeFixResponse {
  fixedContent?: string;
  summary?: string;
}

async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens = 8192,
): Promise<CodeFixResponse | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    logger.error(`[AI-Fix] OpenAI ${res.status}: ${err.error?.message || res.statusText}`);
    return null;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim() || "";

  if (data.choices?.[0]?.finish_reason === "length") {
    logger.error(`[AI-Fix] Response truncated (${text.length} chars)`);
    return null;
  }

  try {
    return JSON.parse(text) as CodeFixResponse;
  } catch (e: unknown) {
    logger.error(`[AI-Fix] JSON parse failed: ${getErrMsg(e)}`);
    return null;
  }
}

function buildPrompt(input: GenerateCodeFixInput): string {
  return `You are a senior application security engineer. Fix the security finding below by editing the file.

**File:** ${input.filePath}
**Rule:** ${input.ruleId}
**Severity:** ${input.severity}
**Finding:** ${input.message}
**Affected lines:** ${input.startLine}-${input.endLine}

**Code snippet (affected region):**
\`\`\`
${input.snippet || "// snippet unavailable"}
\`\`\`

**Full file content:**
\`\`\`
${input.fileContent}
\`\`\`

Return ONLY valid JSON with:
- "fixedContent": the complete corrected file content (not a diff or partial snippet)
- "summary": one sentence describing the fix

Preserve formatting, imports, and unrelated code. Apply the minimal change that resolves the finding.`;
}

export async function generateCodeFix(
  apiKey: string,
  model: string,
  input: GenerateCodeFixInput,
): Promise<GenerateCodeFixResult> {
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured");
  }

  const result = await callOpenAI(apiKey, model, buildPrompt(input));
  if (!result?.fixedContent || result.fixedContent.trim().length === 0) {
    throw new Error("AI failed to generate a code fix");
  }

  if (result.fixedContent === input.fileContent) {
    throw new Error("AI returned unchanged file content");
  }

  return {
    fixedContent: result.fixedContent,
    summary: typeof result.summary === "string" && result.summary.trim().length > 0
      ? result.summary.trim()
      : "Apply security fix for scan finding",
  };
}
