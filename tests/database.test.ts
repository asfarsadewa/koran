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

    expect(fake.getBatched()).toHaveLength(10);
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
    expect(fake.calls.slice(2).map((call) => call.args[0])).toEqual(
      Array.from({ length: 8 }, (_, index) => `2026-08-09-${index + 1}`),
    );
    expect(fake.calls[2]?.args.at(-1)).toBe("https://images.example.com/world/crisis-photo.jpg");
    expect(fake.calls[3]?.args.at(-1)).toBeNull();
  });
});
