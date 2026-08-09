import { defineTool } from "eve/tools";
import { z } from "zod";

import { collectDailyCandidates, dailyCandidateResultSchema } from "../lib/brave-news";

export default defineTool({
  description:
    "Collect one bounded worldwide candidate ledger from Brave News. Call this exactly once per edition. It runs seven diverse 24-hour searches sequentially, deduplicates direct article URLs, and returns compact source metadata and snippets for selection and cross-checking.",
  inputSchema: z.object({}),
  outputSchema: dailyCandidateResultSchema,
  async execute(_input, context) {
    return collectDailyCandidates(process.env.BRAVE_API_KEY ?? "", context.abortSignal);
  },
  toModelOutput(output) {
    const entries = output.results.map(
      (result, index) =>
        `[${index + 1}] ${result.title}\n${result.sourceName} | ${result.publishedAt ?? result.age ?? "waktu tidak tersedia"}\n${result.url}\n${result.description}`,
    );
    return {
      type: "text",
      value: [
        `Buku calon berita: ${output.results.length} laporan dari ${output.searchesRun} pencarian berurutan.`,
        ...entries,
      ].join("\n\n"),
    };
  },
});
