import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const bilingualPath = resolve(
  import.meta.dirname,
  "../migrations/0002_bilingual_editions.sql",
);
const kemarinPath = resolve(import.meta.dirname, "../migrations/0003_kemarin_editions.sql");

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
    expect(sql).toContain("'hari_ini'");
    expect(sql).toContain("DROP TABLE editions");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+articles/iu);
  });
});
