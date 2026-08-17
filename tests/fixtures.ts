import type { EditionPublishInput } from "../shared/edition";

export function validEditionPublish(): EditionPublishInput {
  const chineseArticles = Array.from({ length: 8 }, (_, index) => ({
    rank: index + 1,
    headline: `第${index + 1}号重大灾情报告亟须国际社会持续关注`,
    dek: "经核实的消息表明，此次事态已严重扰乱居民生活及基本公共服务。有关当局仍在汇集较为完整的情况。",
    dateline: "日内瓦",
    impact: "受影响家庭取得粮食、清洁饮水、住所以及基本医疗照护的渠道均已缩减。",
  }));

  return {
    kind: "hari_ini",
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
    translations: {
      zhHans: {
        mastheadDek:
          "多项国际危机继续压迫平民生活，并阻碍刻不容缓的人道救援送抵受灾地区。",
        articles: chineseArticles,
      },
    },
  };
}

export function validKemarinPublish(): EditionPublishInput {
  return {
    ...validEditionPublish(),
    kind: "kemarin",
    editionDate: "1991-08-09",
    publicationDate: "2026-08-09",
    articles: validEditionPublish().articles.map((article, index) => ({
      ...article,
      sourceUrl: `https://en.wikipedia.org/wiki/Historical_crisis_report_${index + 1}`,
      sourcePublishedAt: "1991-08-09T00:00:00Z",
    })),
  };
}

/**
 * A Kemarin sheet from a historically thin morning. The archive left fewer than eight
 * defensible stories, so the sheet prints what it has, ranked 1..count in both
 * languages.
 */
export function shortKemarinPublish(count = 3): EditionPublishInput {
  const full = validKemarinPublish();
  return {
    ...full,
    articles: full.articles.slice(0, count),
    translations: {
      zhHans: {
        ...full.translations.zhHans,
        articles: full.translations.zhHans.articles.slice(0, count),
      },
    },
  };
}
