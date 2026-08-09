import { openai } from "@ai-sdk/openai";
import { defineAgent } from "eve";

export default defineAgent({
  model: openai.responses("gpt-5.6-sol"),
  reasoning: "high",
  limits: {
    maxInputTokensPerSession: 160_000,
    maxOutputTokensPerSession: 12_000,
    sessionTimeoutMs: 2 * 60 * 60 * 1_000,
  },
});
