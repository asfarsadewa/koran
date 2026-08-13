import { defineTool } from "eve/tools";

import {
  collectHistoricalCandidates,
  historicalCandidateResultSchema,
  historicalWindowSchema,
} from "../lib/historical-news";

export default defineTool({
  description:
    "Collect one historical candidate ledger for the Kemarin sheet. Pass editionDate, publicationDate, and both window timestamps from kemarin_publication_context without change. The tool reads Wikipedia year chronologies, the calendar-day page, and Wikimedia on-this-day feeds, then returns dated events with encyclopedia URLs and any contemporaneous citations.",
  inputSchema: historicalWindowSchema,
  outputSchema: historicalCandidateResultSchema,
  async execute(input, context) {
    return collectHistoricalCandidates(input, context.abortSignal);
  },
  toModelOutput(output) {
    const entries = output.results.map(
      (result, index) =>
        `[${index + 1}] ${result.title}\n${result.sourceName} | ${result.publishedAt} | ${result.windowFit}\n${result.url}\n${result.description}${
          result.corroboratingUrls.length
            ? `\nRujukan lain: ${result.corroboratingUrls.join(" · ")}`
            : ""
        }`,
    );
    return {
      type: "text",
      value: [
        `Buku calon Kemarin: ${output.results.length} catatan dari ${output.searchesRun} penyisiran arsip untuk tanggal cetak ${output.editionDate} (dihimpun ${output.publicationDate}).`,
        `Jendela ${output.searchWindowStart} sampai ${output.searchWindowEnd}. windowFit=exact mendahului adjacent, lalu month.`,
        `Disisihkan: ${output.excludedOutsideWindow} di luar bulan itu dan ${output.excludedWithoutTimestamp} tanpa tanggal.`,
        ...entries,
      ].join("\n\n"),
    };
  },
});
