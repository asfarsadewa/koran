import { defineTool } from "eve/tools";

import {
  collectHistoricalCandidates,
  historicalCandidateResultSchema,
  historicalWindowSchema,
  MAX_ARTICLE_ENRICHMENTS,
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

const AVAILABILITY_LABELS: Record<HistoricalEvidence["availableByEdition"], string> = {
  available: "sudah terbit",
  unavailable: "terbit sesudahnya",
  unknown: "waktu terbit tak tentu",
};

const ATTACHMENT_LABELS: Record<HistoricalEvidence["attachedTo"], string> = {
  "event-line": "dikutip pada baris peristiwa",
  article: "dari daftar rujukan artikel",
};

function renderEvidence(evidence: HistoricalEvidence[]): string {
  return evidence
    .map(
      (item) =>
        `  - ${item.publisher} | ${SOURCE_TYPE_LABELS[item.sourceType]} | ${
          TIMING_LABELS[item.timing]
        }${item.publishedAt ? ` ${item.publishedAt}` : ""} | ${
          AVAILABILITY_LABELS[item.availableByEdition]
        } | ${ATTACHMENT_LABELS[item.attachedTo]} | ${item.url}`,
    )
    .join("\n");
}

export default defineTool({
  description:
    "Collect one historical candidate ledger for the Kemarin sheet. Pass editionDate, publicationDate, and both window timestamps from kemarin_publication_context without change. The tool reads the Wikipedia year chronology for the printed month and the month before it, the calendar-day page, and the Wikimedia on-this-day feeds, then returns dated events placed by distance from the printed day — exact, adjacent, ongoing, or recent. Nothing dated after the printed day is returned, so the sheet cannot report what had not happened yet. Every source is classified twice over: as contemporary reporting, later history or undated, and separately as something the desk of that morning could or could not have held. It also reports which countries saw unusual conflict that day according to the GDELT event archive, and which of those no candidate mentions — a warning that the day's coverage may be lopsided, never a source in itself.",
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
        result.hasEditionTimeEvidence
          ? "sudah terbit sebelum tanggal cetak"
          : "belum terbit pada tanggal cetak",
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
    const enrichment = output.diagnostics.articleEnrichment;
    const unnamed = output.diagnostics.conflictPressure.filter((entry) => !entry.named);
    const pressureLines = output.diagnostics.conflictPressure.length
      ? [
          `Tekanan pertikaian pada tanggal cetak, menurut arsip peristiwa GDELT, diukur terhadap kelaziman negeri itu sendiri sepanjang tahun: ${output.diagnostics.conflictPressure
            .map((entry) => `${entry.country} ${entry.ratio.toFixed(1)}× (${entry.events})`)
            .join(", ")}.`,
          unnamed.length
            ? `Tidak ada satu pun calon di atas yang menyebut ${unnamed
                .map((entry) => entry.country)
                .join(", ")}. Arsip itu hanya mencatat bahwa kekerasan terjadi di sana; ia tidak memuat judul, ringkasan, atau tautan, sehingga tidak boleh dipakai sebagai sumber. Anggaplah ini petunjuk bahwa liputan hari itu mungkin timpang, bukan berita yang sudah siap. Apabila hendak memuatnya, cari lebih dahulu sumber yang sah; apabila tidak ada, jangan mengarang.`
            : "Setiap negeri yang tertekan hari itu sudah disebut oleh sekurang-kurangnya satu calon.",
        ]
      : [];

    return {
      type: "text",
      value: [
        `Buku calon Kemarin: ${output.results.length} catatan dari ${output.searchesRun} penyisiran arsip untuk tanggal cetak ${output.editionDate} (dihimpun ${output.publicationDate}).`,
        `Kesesuaian tanggal: exact ${fit.exact} (hari cetak atau petang sebelumnya), adjacent ${fit.adjacent} (dua hari sebelumnya, tempat jendela redaksi masih mencapainya), ongoing ${fit.ongoing} (rentang bertanggal yang sudah berjalan dan belum tutup pada pagi itu), recent ${fit.recent} (peristiwa bertanggal tunggal yang sudah lewat; catatan tidak mengatakan ia masih berlangsung). Daftar disusun menurut kesesuaian tanggal lebih dahulu, lalu menurut nilai bukti di dalam tiap golongan. Nilai bukti hanya mengurutkan daftar, bukan memilih edisi.`,
        `Bukti sezaman pada ${output.diagnostics.withContemporaryEvidence} catatan, dan pada ${output.diagnostics.withEditionTimeEvidence} di antaranya bukti itu sudah terbit sebelum tanggal cetak sehingga meja redaksi pagi itu memang dapat memegangnya. Sumber bebas pada ${output.diagnostics.withIndependentCorroboration} catatan, dan ${output.diagnostics.encyclopediaOnly} catatan hanya bersandar pada ensiklopedia.`,
        `Calon yang semula hanya bersandar pada ensiklopedia dibacakan kembali daftar rujukan artikelnya: ${enrichment.eligible} calon memenuhi syarat, ${enrichment.attempted} dibaca, ${enrichment.enriched} mendapat rujukan sezaman.${
          enrichment.eligible > enrichment.attempted
            ? ` ${enrichment.eligible - enrichment.attempted} sisanya tidak dibaca karena batas ${MAX_ARTICLE_ENRICHMENTS} permintaan; anggaplah buktinya belum diperiksa, bukan tidak ada.`
            : ""
        } Rujukan yang datang dari daftar artikel hanya disaring menurut tanggalnya, jadi ia dekat pada pekan peristiwa tetapi belum tentu berbicara tentang kejadian ini; periksa sebelum memakainya.`,
        `Disisihkan: ${output.diagnostics.excludedFuture} peristiwa di dalam bulan cetak yang baru terjadi sesudah tanggal cetak, ${output.diagnostics.excludedTooOld} yang terlalu jauh ke belakang, ${output.diagnostics.excludedOtherYear} dari tahun lain — halaman hari dan umpan on-this-day memuat setiap tahun yang pernah memakai tanggal itu, jadi angka ini tidak mengatakan apa-apa tentang ramai atau sepinya hari cetak — dan ${output.excludedWithoutTimestamp} tanpa tanggal.`,
        ...pressureLines,
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
