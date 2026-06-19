import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  streamText,
  type StreamTextResult,
  type ToolSet,
  type UIMessage,
} from "ai";
import {
  aiDocumentFormats,
  injectDocumentStateMessages,
  toolDefinitionsToToolSet,
} from "@blocknote/xl-ai/server";
import { env } from "../../../shared/config.js";

type ToolDefinitions = Parameters<typeof toolDefinitionsToToolSet>[0];

export async function createOverviewAiStream(body: {
  messages: UIMessage[];
  toolDefinitions?: ToolDefinitions;
}): Promise<StreamTextResult<ToolSet, never>> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("AI is not configured");
  }

  const messages = injectDocumentStateMessages(body.messages);
  const tools = toolDefinitionsToToolSet(body.toolDefinitions ?? {});

  return streamText({
    model: openai(env.OPENAI_MODEL),
    system: aiDocumentFormats.html.systemPrompt,
    messages: await convertToModelMessages(messages),
    tools,
    toolChoice: "required",
  });
}
