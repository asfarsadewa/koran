import { defineTool } from "eve/tools";

import {
  collectHistoricalCandidates,
  historicalCandidateResultSchema,
  historicalWindowSchema,
  type HistoricalEvidence,
} from "../lib/historical-news";

const SOURCE_TYPE_LABELS: Record<HistoricalEvidence["sourceType"], string> = {
  encyclopedia: "ensiklopedia",
  news: "pers",
  institution: "lembaga",
  archive: "arsip",
  other: "lain",
};

const TIMING_LABELS: Record<HistoricalEvidence["timing"], string> = {
  contemporary: "sezaman",
  retrospective: "kemudian",
  unknown: "tanpa tanggal",
};

function renderEvidence(evidence: HistoricalEvidence[]): string {
  return evidence
    .map(
      (item) =>
        `  - ${item.publisher} | ${SOURCE_TYPE_LABELS[item.sourceType]} | ${
          TIMING_LABELS[item.timing]
        }${item.publishedAt ? ` ${item.publishedAt}` : ""} | ${item.url}`,
    )
    .join("\n");
}

export default defineTool({
  description:
    "Collect one historical candidate ledger for the Kemarin sheet. Pass editionDate, publicationDate, and both window timestamps from kemarin_publication_context without change. The tool reads the Wikipedia year chronology for the printed month and the month before it, the calendar-day page, and the Wikimedia on-this-day feeds, then returns dated events whose sources are classified as contemporary reporting, later history, or undated. Events dated after the printed day are dropped so the sheet cannot report what had not happened yet.",
  inputSchema: historicalWindowSchema,
  outputSchema: historicalCandidateResultSchema,
  async execute(input, context) {
    return collectHistoricalCandidates(input, context.abortSignal);
  },
  toModelOutput(output) {
    const entries = output.results.map((result, index) => {
      const offset =
        result.dayOffset === 0
          ? "hari cetak"
          : `${result.dayOffset > 0 ? "+" : ""}${result.dayOffset} hari`;
      const marks = [
        result.hasContemporaryEvidence ? "bukti sezaman" : "tanpa bukti sezaman",
        result.hasIndependentCorroboration ? "ada sumber bebas" : "hanya ensiklopedia",
      ].join(", ");
      return [
        `[${index + 1}] ${result.title}`,
        `${result.sourceName} | ${result.publishedAt.slice(0, 10)} | ${result.windowFit} (${offset}) | nilai ${result.evidenceScore} | ${marks}`,
        `Ditemukan oleh: ${result.discoveredBy.join(", ")}`,
        result.url,
        result.description,
        `Bukti:\n${renderEvidence(result.evidence)}`,
      ].join("\n");
    });

    const fit = output.diagnostics.windowFit;
    return {
      type: "text",
      value: [
        `Buku calon Kemarin: ${output.results.length} catatan dari ${output.searchesRun} penyisiran arsip untuk tanggal cetak ${output.editionDate} (dihimpun ${output.publicationDate}).`,
        `Kesesuaian tanggal: exact ${fit.exact} (hari cetak atau petang sebelumnya), adjacent ${fit.adjacent} (sehari sebelum atau sesudah), ongoing ${fit.ongoing} (krisis yang sudah berjalan dan masih berlangsung pagi itu). Daftar disusun menurut kesesuaian tanggal lebih dahulu, lalu menurut nilai bukti di dalam tiap golongan. Nilai bukti hanya mengurutkan daftar, bukan memilih edisi.`,
        `Bukti sezaman pada ${output.diagnostics.withContemporaryEvidence} catatan, sumber bebas pada ${output.diagnostics.withIndependentCorroboration}, dan ${output.diagnostics.encyclopediaOnly} catatan hanya bersandar pada ensiklopedia.`,
        `Disisihkan: ${output.diagnostics.excludedFuture} peristiwa yang baru terjadi sesudah tanggal cetak, ${output.diagnostics.excludedTooOld} yang terlalu jauh ke belakang, dan ${output.excludedWithoutTimestamp} tanpa tanggal.`,
        ...(output.diagnostics.fallbacks.length
          ? [`Umpan cadangan dipakai: ${output.diagnostics.fallbacks.join(", ")}.`]
          : []),
        ...(output.diagnostics.failures.length
          ? [`Sumber yang gagal dibaca: ${output.diagnostics.failures.join(", ")}.`]
          : []),
        ...entries,
      ].join("\n\n"),
    };
  },
});
