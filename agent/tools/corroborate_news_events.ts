import { defineTool } from "eve/tools";

import {
  corroborateDailyEvents,
  corroborationInputSchema,
  corroborationResultSchema,
} from "../lib/brave-news";

export default defineTool({
  description:
    "Find an independent second publisher for selected events of this morning's hari_ini edition. Call it at most once, after collect_news_candidates, with one English query per event that the candidate ledger does not yet confirm from two independent publishers (up to eight queries). Pass both window timestamps from publication_context unchanged. Each query runs one Brave News search over the same calendar range; results are filtered to the same exact 36-hour window and join the candidate ledger. Do not use it to discover new events, and do not use it for the Kemarin sheet.",
  inputSchema: corroborationInputSchema,
  outputSchema: corroborationResultSchema,
  async execute(input, context) {
    return corroborateDailyEvents(process.env.BRAVE_API_KEY ?? "", input, context.abortSignal);
  },
  toModelOutput(output) {
    const sections = output.searches.map((search, searchIndex) => {
      const entries = search.results.map(
        (result, index) =>
          `[${searchIndex + 1}.${index + 1}] ${result.title}\n${result.sourceName} | ${result.publishedAt ?? result.age ?? "waktu tidak tersedia"}\n${result.url}\n${result.description}`,
      );
      return [
        `Kueri ${searchIndex + 1}: ${search.query} — ${search.results.length} laporan di dalam jendela.`,
        ...entries,
      ].join("\n\n");
    });
    return {
      type: "text",
      value: [
        `Pemeriksaan silang: ${output.searchesRun} pencarian untuk jendela ${output.searchWindowStart} sampai ${output.searchWindowEnd}.`,
        `Disisihkan oleh pemeriksaan waktu: ${output.excludedOutsideWindow} di luar jendela dan ${output.excludedWithoutTimestamp} tanpa waktu terbit yang dapat dipastikan.`,
        ...sections,
      ].join("\n\n"),
    };
  },
});
