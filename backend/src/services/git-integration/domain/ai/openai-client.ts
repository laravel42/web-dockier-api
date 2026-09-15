/**
 * Shared OpenAI chat-completions client for the git-integration AI modules.
 *
 * Consolidates the previously-duplicated `callOpenAI` implementations from
 * ai-fix, ai-analysis, review-pr-ai, and fix-issue-ai. Each caller differed
 * only in log tag, temperature, and how it handled a truncated response — all
 * of which are now options — so this is behavior-preserving.
 */

import { logger } from "../../../../shared/logger.js";
import { getErrMsg } from "../../../../shared/utils/error-message.js";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export type OpenAIMessage = { role: string; content: string };

/**
 * How to treat a response the model cut short (`finish_reason === "length"`):
 * - `"null"`  — log an error and return null (drop the partial result)
 * - `"warn"`  — log a warning but still return the (partial) text
 * - `"ignore"` — no logging, return the text as-is
 */
export type TruncationHandling = "null" | "warn" | "ignore";

export interface CallOpenAIChatOptions {
  apiKey: string;
  model: string;
  messages: OpenAIMessage[];
  /** Sampling temperature. Defaults to 0. */
  temperature?: number;
  /** Max completion tokens. Defaults to 8192. */
  maxTokens?: number;
  /** Prefix used in log lines, e.g. "[AI-Fix]". */
  logTag: string;
  /** What to do when the response is truncated. Defaults to "warn". */
  truncation?: TruncationHandling;
}

/**
 * Call the OpenAI chat-completions endpoint and return the trimmed message
 * content, or null on error / (optionally) truncation.
 *
 * Always requests `response_format: { type: "json_object" }`.
 */
export async function callOpenAIChat(options: CallOpenAIChatOptions): Promise<string | null> {
  const {
    apiKey,
    model,
    messages,
    temperature = 0,
    maxTokens = 8192,
    logTag,
    truncation = "warn",
  } = options;

  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    logger.error(`${logTag} OpenAI ${res.status}: ${err.error?.message || res.statusText}`);
    return null;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim() || "";
  const truncated = data.choices?.[0]?.finish_reason === "length";

  if (truncated) {
    if (truncation === "null") {
      logger.error(`${logTag} Response truncated (${text.length} chars)`);
      return null;
    }
    if (truncation === "warn") {
      logger.warn(`${logTag} Response truncated`);
    }
  }

  return text || null;
}

/**
 * Convenience wrapper that calls the chat endpoint and parses the response as
 * JSON. Returns null (and logs) on request error, truncation, or parse failure.
 */
export async function callOpenAIJson<T>(
  options: CallOpenAIChatOptions,
): Promise<T | null> {
  const text = await callOpenAIChat(options);
  if (text === null) return null;

  try {
    return JSON.parse(text) as T;
  } catch (e: unknown) {
    logger.error(`${options.logTag} JSON parse failed: ${getErrMsg(e)}`);
    return null;
  }
}
