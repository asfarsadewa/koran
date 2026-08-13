import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

const bilingualPath = resolve(
  import.meta.dirname,
  "../migrations/0002_bilingual_editions.sql",
);
const kemarinPath = resolve(import.meta.dirname, "../migrations/0003_kemarin_editions.sql");

function migrationPath(file: string): string {
  return resolve(import.meta.dirname, `../migrations/${file}`);
}

/**
 * D1 enforces foreign keys for every transaction and does not honour
 * `PRAGMA foreign_keys = OFF`, so the migrations are replayed here under the
 * same constraint the platform applies.
 */
async function migratedDatabase(files: string[]): Promise<DatabaseSync> {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON;");
  for (const file of files) {
    database.exec(await readFile(migrationPath(file), "utf8"));
  }
  return database;
}

function seedEdition(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO editions
      (id, edition_date, issue_number, masthead_dek, published_at, curator_model, is_demo)
    VALUES ('2026-08-09', '2026-08-09', 1, 'Ikhtisar dunia pada hari ini.',
            '2026-08-09T01:00:00.000Z', 'gpt-5.6-sol', 0);
    INSERT INTO articles
      (id, edition_id, rank, section, headline, dek, dateline, source_name,
       source_url, source_published_at, impact, image_url)
    VALUES ('2026-08-09-1', '2026-08-09', 1, 'conflict', 'Tajuk', 'Dek', 'MOGADISHU',
            'Kantor Berita', 'https://example.com/world/report-one',
            '2026-08-09T00:00:00.000Z', 'Dampak', 'https://images.example.com/a.jpg'),
           ('2026-08-09-2', '2026-08-09', 2, 'disaster', 'Tajuk', 'Dek', 'MANILA',
            'Kantor Berita', 'https://example.com/world/report-two',
            '2026-08-09T00:00:00.000Z', 'Dampak', NULL);
    INSERT INTO edition_translations (edition_id, locale, masthead_dek)
    VALUES ('2026-08-09', 'zh-Hans', '今日世界摘要');
    INSERT INTO article_translations (article_id, locale, headline, dek, dateline, impact)
    VALUES ('2026-08-09-1', 'zh-Hans', '标题', '摘要', '摩加迪沙', '影响');
  `);
}

function rowCount(database: DatabaseSync, table: string): number {
  return (database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe("bilingual D1 migration", () => {
  it("adds translation tables without rewriting any historical edition or article", async () => {
    const sql = await readFile(bilingualPath, "utf8");

    expect(sql).toContain("CREATE TABLE edition_translations");
    expect(sql).toContain("CREATE TABLE article_translations");
    expect(sql).toContain("REFERENCES editions(id) ON DELETE CASCADE");
    expect(sql).toContain("REFERENCES articles(id) ON DELETE CASCADE");
    expect(sql).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:editions|articles)\b/iu);
  });
});

describe("Kemarin D1 migration", () => {
  it("adds sheet kind and publication date while copying existing editions as hari_ini", async () => {
    const sql = await readFile(kemarinPath, "utf8");

    expect(sql).toContain("kind TEXT NOT NULL DEFAULT 'hari_ini'");
    expect(sql).toContain("publication_date TEXT NOT NULL");
    expect(sql).toContain("UNIQUE (kind, publication_date)");
    // D1 ignores it, so the rebuild must never depend on it as a statement.
    expect(sql).not.toMatch(/^\s*PRAGMA\s+foreign_keys/imu);
  });

  it("keeps every article and translation while foreign keys stay enforced", async () => {
    const database = await migratedDatabase(["0001_initial.sql", "0002_bilingual_editions.sql"]);
    seedEdition(database);
    database.exec(await readFile(kemarinPath, "utf8"));

    expect(rowCount(database, "editions")).toBe(1);
    expect(rowCount(database, "articles")).toBe(2);
    expect(rowCount(database, "edition_translations")).toBe(1);
    expect(rowCount(database, "article_translations")).toBe(1);

    expect(database.prepare("SELECT kind, edition_date, publication_date FROM editions").get()).toEqual(
      { kind: "hari_ini", edition_date: "2026-08-09", publication_date: "2026-08-09" },
    );
    expect(
      database.prepare("SELECT image_url FROM articles WHERE id = '2026-08-09-1'").get(),
    ).toEqual({ image_url: "https://images.example.com/a.jpg" });

    database.close();
  });

  it("leaves the rebuilt schema able to cascade, index, and separate the two sheets", async () => {
    const database = await migratedDatabase([
      "0001_initial.sql",
      "0002_bilingual_editions.sql",
      "0003_kemarin_editions.sql",
    ]);

    // Both sheets may print the same historical date on a leap-day clamp.
    database.exec(`
      INSERT INTO editions
        (id, kind, edition_date, publication_date, issue_number, masthead_dek,
         published_at, curator_model, is_demo)
      VALUES ('kemarin-2028-02-28', 'kemarin', '1993-02-28', '2028-02-28', 1, 'dek',
              '2028-02-28T01:00:00.000Z', 'gpt-5.6-sol', 0),
             ('kemarin-2028-02-29', 'kemarin', '1993-02-28', '2028-02-29', 2, 'dek',
              '2028-02-29T01:00:00.000Z', 'gpt-5.6-sol', 0);
    `);
    expect(rowCount(database, "editions")).toBe(2);

    // The same sheet kind may not be assembled twice on one Perth day.
    expect(() =>
      database.exec(`
        INSERT INTO editions
          (id, kind, edition_date, publication_date, issue_number, masthead_dek,
           published_at, curator_model, is_demo)
        VALUES ('duplicate', 'kemarin', '1993-02-28', '2028-02-29', 3, 'dek',
                '2028-02-29T02:00:00.000Z', 'gpt-5.6-sol', 0);
      `),
    ).toThrow(/UNIQUE/iu);

    // Foreign keys and their cascades survived the rebuild.
    database.exec(`
      INSERT INTO articles
        (id, edition_id, rank, section, headline, dek, dateline, source_name,
         source_url, source_published_at, impact, image_url)
      VALUES ('a1', 'kemarin-2028-02-28', 1, 'conflict', 'Tajuk', 'Dek', 'MOSKWA',
              'Ensiklopedia', 'https://en.wikipedia.org/wiki/Example',
              '1993-02-28T00:00:00.000Z', 'Dampak', NULL);
      INSERT INTO article_translations (article_id, locale, headline, dek, dateline, impact)
      VALUES ('a1', 'zh-Hans', '标题', '摘要', '莫斯科', '影响');
    `);
    expect(() =>
      database.exec(`
        INSERT INTO articles
          (id, edition_id, rank, section, headline, dek, dateline, source_name,
           source_url, source_published_at, impact, image_url)
        VALUES ('orphan', 'no-such-edition', 1, 'conflict', 'Tajuk', 'Dek', 'X',
                'Y', 'https://example.com/a', '1993-02-28T00:00:00.000Z', 'Z', NULL);
      `),
    ).toThrow(/FOREIGN KEY/iu);

    database.exec("DELETE FROM editions WHERE id = 'kemarin-2028-02-28';");
    expect(rowCount(database, "articles")).toBe(0);
    expect(rowCount(database, "article_translations")).toBe(0);

    const indexes = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(indexes).toEqual(
      expect.arrayContaining([
        "articles_by_edition_rank",
        "editions_by_date",
        "editions_by_kind_publication",
      ]),
    );

    database.close();
  });

  it("no longer carries the edition_date uniqueness that blocked the leap-day clamp", async () => {
    const legacy = await migratedDatabase(["0001_initial.sql", "0002_bilingual_editions.sql"]);
    const legacyUnique = legacy
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'editions'")
      .get() as { sql: string };
    expect(legacyUnique.sql).toMatch(/edition_date TEXT NOT NULL UNIQUE/u);
    legacy.close();

    const migrated = await migratedDatabase([
      "0001_initial.sql",
      "0002_bilingual_editions.sql",
      "0003_kemarin_editions.sql",
    ]);
    const rebuilt = migrated
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'editions'")
      .get() as { sql: string };
    expect(rebuilt.sql).not.toMatch(/edition_date TEXT NOT NULL UNIQUE/u);
    migrated.close();
  });
});
