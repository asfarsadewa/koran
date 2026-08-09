import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  import.meta.dirname,
  "../migrations/0002_bilingual_editions.sql",
);

describe("bilingual D1 migration", () => {
  it("adds translation tables without rewriting any historical edition or article", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("CREATE TABLE edition_translations");
    expect(sql).toContain("CREATE TABLE article_translations");
    expect(sql).toContain("REFERENCES editions(id) ON DELETE CASCADE");
    expect(sql).toContain("REFERENCES articles(id) ON DELETE CASCADE");
    expect(sql).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:editions|articles)\b/iu);
  });
});
