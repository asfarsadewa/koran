import { defineTool } from "eve/tools";

import {
  collectDailyCandidates,
  dailyCandidateResultSchema,
  editorialWindowSchema,
} from "../lib/brave-news";

export default defineTool({
  description:
    "Collect one worldwide candidate ledger for the exact 36-hour editorial window returned by publication_context. Pass both window timestamps unchanged. The tool runs seven broader calendar-range Brave News searches sequentially, deduplicates direct article URLs, then rejects undated and out-of-window results before returning compact source metadata and snippets.",
  inputSchema: editorialWindowSchema,
  outputSchema: dailyCandidateResultSchema,
  async execute(input, context) {
    return collectDailyCandidates(
      process.env.BRAVE_API_KEY ?? "",
      input,
      context.abortSignal,
    );
  },
  toModelOutput(output) {
    const entries = output.results.map(
      (result, index) =>
        `[${index + 1}] ${result.title}\n${result.sourceName} | ${result.publishedAt ?? result.age ?? "waktu tidak tersedia"}\n${result.url}\n${result.description}`,
    );
    return {
      type: "text",
      value: [
        `Buku calon berita: ${output.results.length} laporan dari ${output.searchesRun} pencarian berurutan untuk jendela ${output.searchWindowStart} sampai ${output.searchWindowEnd}.`,
        `Disisihkan oleh pemeriksaan waktu: ${output.excludedOutsideWindow} di luar jendela dan ${output.excludedWithoutTimestamp} tanpa waktu terbit yang dapat dipastikan.`,
        ...entries,
      ].join("\n\n"),
    };
  },
});
