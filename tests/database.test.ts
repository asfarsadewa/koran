import { afterEach, describe, expect, it, vi } from "vitest";

import { publishEdition, readLatestEdition } from "../src/database";
import { validEditionPublish } from "./fixtures";

interface PreparedCall {
  sql: string;
  args: unknown[];
}

interface FakeDatabaseOptions {
  edition?: Record<string, unknown> | null;
  articles?: Record<string, unknown>[];
}

function fakeDatabase(options: FakeDatabaseOptions = {}) {
  const calls: PreparedCall[] = [];
  let batched: D1PreparedStatement[] = [];
  const database = {
    prepare(sql: string) {
      const call: PreparedCall = { sql, args: [] };
      calls.push(call);
      const statement = {
        bind(...args: unknown[]) {
          call.args = args;
          return statement;
        },
        async first<T>() {
          return (options.edition ?? null) as T | null;
        },
        async all<T>() {
          return {
            success: true,
            results: (options.articles ?? []) as T[],
            meta: {},
          } as D1Result<T>;
        },
      };
      return statement as unknown as D1PreparedStatement;
    },
    async batch(statements: D1PreparedStatement[]) {
      batched = statements;
      return [];
    },
  } as unknown as D1Database;

  return { database, calls, getBatched: () => batched };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("readLatestEdition", () => {
  it("returns null without querying articles when no edition exists", async () => {
    const fake = fakeDatabase({ edition: null });
    await expect(readLatestEdition(fake.database)).resolves.toBeNull();
    expect(fake.calls).toHaveLength(1);
  });

  it("maps D1 rows into the public camel-case edition shape", async () => {
    const fake = fakeDatabase({
      edition: {
        id: "2026-08-09",
        edition_date: "2026-08-09",
        issue_number: 1,
        masthead_dek: "Ikhtisar dunia pada hari ini.",
        published_at: "2026-08-09T01:00:00.000Z",
        curator_model: "gpt-5.6-sol",
        is_demo: 1,
        masthead_dek_zh: null,
      },
      articles: [
        {
          id: "2026-08-09-1",
          rank: 1,
          section: "humanitarian",
          headline: "Judul laporan kemanusiaan yang telah diperiksa",
          dek: "Keterangan panjang mengenai keadaan kemanusiaan.",
          dateline: "JENEWA",
          source_name: "Penerbit Contoh",
          source_url: "https://example.com/world/report-on-humanitarian-access",
          source_published_at: "2026-08-09T00:00:00Z",
          impact: "Dampak panjang terhadap warga sipil dan layanan pokok.",
          image_url: "https://images.example.com/world/photo.jpg",
        },
        {
          id: "2026-08-09-2",
          rank: 2,
          section: "disaster",
          headline: "Judul laporan bencana yang telah diperiksa",
          dek: "Keterangan panjang mengenai keadaan bencana.",
          dateline: "MANILA",
          source_name: "Penerbit Kedua",
          source_url: "https://example.com/world/report-on-major-disaster",
          source_published_at: "2026-08-09T00:30:00Z",
          impact: "Dampak panjang terhadap tempat tinggal dan layanan pokok.",
          image_url: null,
        },
      ],
    });

    const edition = await readLatestEdition(fake.database);

    expect(fake.calls[1]?.args).toEqual(["2026-08-09"]);
    expect(edition).toMatchObject({
      id: "2026-08-09",
      editionDate: "2026-08-09",
      issueNumber: 1,
      curatorModel: "gpt-5.6-sol",
      isDemo: true,
    });
    expect(edition?.articles[0]).toMatchObject({
      sourceName: "Penerbit Contoh",
      imageUrl: "https://images.example.com/world/photo.jpg",
    });
    expect(edition?.articles[1]).not.toHaveProperty("imageUrl");
    expect(edition).not.toHaveProperty("translations");
    expect(fake.calls[0]?.sql).toContain("LEFT JOIN edition_translations");
    expect(fake.calls[1]?.sql).toContain("LEFT JOIN article_translations");
  });

  it("returns a Chinese edition only when all eight translated articles are complete", async () => {
    const fake = fakeDatabase({
      edition: {
        id: "2026-08-10",
        edition_date: "2026-08-10",
        issue_number: 2,
        masthead_dek: "Ikhtisar dunia pada hari ini.",
        published_at: "2026-08-10T01:00:00.000Z",
        curator_model: "gpt-5.6-sol",
        is_demo: 0,
        masthead_dek_zh: "今日世界灾情摘要说明各地平民所承受的严重后果。",
      },
      articles: Array.from({ length: 8 }, (_, index) => ({
        id: `2026-08-10-${index + 1}`,
        rank: index + 1,
        section: "humanitarian",
        headline: `Judul laporan kemanusiaan nomor ${index + 1}`,
        dek: "Keterangan panjang mengenai keadaan kemanusiaan.",
        dateline: "JENEWA",
        source_name: "Penerbit Contoh",
        source_url: `https://example.com/world/report-on-humanitarian-access-${index + 1}`,
        source_published_at: "2026-08-10T00:00:00Z",
        impact: "Dampak panjang terhadap warga sipil dan layanan pokok.",
        image_url: null,
        headline_zh: `第${index + 1}号人道危机报告受到关注`,
        dek_zh: "经核实的消息表明当地居民生活及基本公共服务遭受严重扰乱。",
        dateline_zh: "日内瓦",
        impact_zh: "受影响家庭取得粮食、清洁饮水以及医疗照护的渠道已经缩减。",
      })),
    });

    const edition = await readLatestEdition(fake.database);

    expect(edition?.translations?.zhHans.articles).toHaveLength(8);
    expect(edition?.translations?.zhHans.mastheadDek).toBe(
      "今日世界灾情摘要说明各地平民所承受的严重后果。",
    );
    expect(edition?.translations?.zhHans.articles[0]).toMatchObject({
      rank: 1,
      dateline: "日内瓦",
    });
  });
});

describe("publishEdition", () => {
  it("upserts one edition, clears its former articles, and inserts eight stories in rank order", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T02:03:04.000Z"));
    const fake = fakeDatabase();
    const edition = validEditionPublish();
    edition.articles.reverse();

    await expect(publishEdition(fake.database, edition)).resolves.toEqual({
      editionId: "2026-08-09",
      articleCount: 8,
    });

    expect(fake.getBatched()).toHaveLength(19);
    expect(fake.calls[0]?.sql).toContain("ON CONFLICT(id) DO UPDATE");
    expect(fake.calls[0]?.args).toEqual([
      "2026-08-09",
      "2026-08-09",
      1,
      edition.mastheadDek,
      "2026-08-09T02:03:04.000Z",
      "gpt-5.6-sol",
    ]);
    expect(fake.calls[1]).toMatchObject({
      sql: "DELETE FROM articles WHERE edition_id = ?",
      args: ["2026-08-09"],
    });
    expect(fake.calls[2]?.sql).toContain("INSERT INTO edition_translations");
    expect(fake.calls[2]?.args).toEqual([
      "2026-08-09",
      edition.translations.zhHans.mastheadDek,
    ]);
    const articleCalls = fake.calls.filter((call) => call.sql.includes("INSERT INTO articles"));
    const translationCalls = fake.calls.filter((call) =>
      call.sql.includes("INSERT INTO article_translations"),
    );
    expect(articleCalls.map((call) => call.args[0])).toEqual(
      Array.from({ length: 8 }, (_, index) => `2026-08-09-${index + 1}`),
    );
    expect(translationCalls).toHaveLength(8);
    expect(articleCalls[0]?.args.at(-1)).toBe("https://images.example.com/world/crisis-photo.jpg");
    expect(articleCalls[1]?.args.at(-1)).toBeNull();
    expect(translationCalls[0]?.args.slice(1)).toEqual([
      edition.translations.zhHans.articles[0]?.headline,
      edition.translations.zhHans.articles[0]?.dek,
      edition.translations.zhHans.articles[0]?.dateline,
      edition.translations.zhHans.articles[0]?.impact,
    ]);
  });
});
