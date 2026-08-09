import type { EditionPublishInput } from "../shared/edition";

export function validEditionPublish(): EditionPublishInput {
  return {
    editionDate: "2026-08-09",
    issueNumber: 1,
    mastheadDek:
      "Sejumlah krisis dunia menekan kehidupan warga sipil dan menghambat penyaluran pertolongan yang mendesak.",
    curatorModel: "gpt-5.6-sol",
    articles: Array.from({ length: 8 }, (_, index) => ({
      rank: index + 1,
      section: index % 2 === 0 ? ("humanitarian" as const) : ("disaster" as const),
      headline: `Laporan Berdampak Besar Nomor ${index + 1} Memerlukan Perhatian Dunia`,
      dek:
        "Keterangan yang telah diperiksa menunjukkan gangguan serius terhadap kehidupan warga dan layanan pokok. Pihak berwenang masih menghimpun keadaan selengkapnya.",
      dateline: "JENEWA",
      sourceName: `Penerbit Berita ${index + 1}`,
      sourceUrl: `https://example.com/world/report-on-world-crisis-${index + 1}`,
      sourcePublishedAt: "2026-08-09T00:00:00Z",
      impact:
        "Gangguan tersebut mengurangi akses keluarga terhadap pangan, air bersih, tempat tinggal, serta perawatan kesehatan dasar.",
      ...(index === 0 ? { imageUrl: "https://images.example.com/world/crisis-photo.jpg" } : {}),
    })),
  };
}
