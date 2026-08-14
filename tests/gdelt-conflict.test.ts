import { describe, expect, it } from "vitest";

import {
  conflictPressureFor,
  INDEXED_YEARS,
  markCoverage,
  namesPressureCountry,
  parseConflictDay,
  PRESSURE_RATIO_FLOOR,
} from "../agent/lib/gdelt-conflict";
import { buildKemarinPublicationContext } from "../agent/lib/publication-context";

/** Long enough before the printed year turns over to rebuild the index unhurried. */
const REBUILD_LEAD_DAYS = 120;

describe("conflict index", () => {
  it("decodes the compact day format into named countries", () => {
    expect(parseConflictDay("LE:70:5.4,ZI:16:29.2")).toEqual([
      { code: "LE", country: "Lebanon", events: 70, ratio: 5.4 },
      { code: "ZI", country: "Zimbabwe", events: 16, ratio: 29.2 },
    ]);
  });

  it("falls back to the raw code for a country the archive never named", () => {
    expect(parseConflictDay("ZZ:9:3.0")[0]).toMatchObject({ code: "ZZ", country: "ZZ" });
  });

  it("reads a printed day out of the built index", () => {
    const pressure = conflictPressureFor("1991-08-13");
    expect(pressure?.length).toBeGreaterThan(0);
    expect(pressure?.map((entry) => entry.country)).toContain("Lebanon");
    // Ranked by anomaly against each country's own year, not by raw volume.
    expect(pressure?.[0]?.ratio).toBeGreaterThan(pressure?.at(-1)?.ratio ?? 0);
  });

  /**
   * The printed year advances with the calendar, and the index does not. Nothing
   * breaks when it falls behind — the ledger reports the gap and the sheet still
   * publishes — but nobody would see it, because only the agent reads that note at
   * seven in the morning. So the alarm lives here, where a build has to look at it,
   * and it rings a season before the sheet actually needs the year.
   */
  it("still covers the years this sheet is about to print", () => {
    const printedYear = (at: Date) => buildKemarinPublicationContext(at).editionDate.slice(0, 4);
    const required = [
      printedYear(new Date()),
      printedYear(new Date(Date.now() + REBUILD_LEAD_DAYS * 86_400_000)),
    ];
    const missing = [...new Set(required)].filter((year) => !INDEXED_YEARS.includes(year));
    const wanted = [...new Set([...INDEXED_YEARS, ...required])].sort();

    expect(
      missing,
      `The Kemarin sheet prints ${missing.join(" and ")} within ${REBUILD_LEAD_DAYS} days and the GDELT index stops at ${INDEXED_YEARS.at(-1)}. Rebuild it with: npm run gdelt:index -- ${wanted.join(" ")}`,
    ).toEqual([]);
  });

  it("separates an unindexed year from a quiet day", () => {
    expect(INDEXED_YEARS).toContain("1991");
    // A year nobody has built yet: the caller must be able to report that.
    expect(conflictPressureFor("1975-08-13")).toBeNull();
    expect(conflictPressureFor("not-a-date")).toBeNull();
  });
});

describe("naming countries under pressure", () => {
  const pressure = [
    { code: "LE", country: "Lebanon", events: 70, ratio: 5.4 },
    { code: "IS", country: "Israel", events: 48, ratio: 1.1 },
  ];

  it("reads a demonym built by adding to the country name", () => {
    expect(namesPressureCountry("Lebanese families flee the shelling", pressure)).toBe(false);
    expect(namesPressureCountry("Shelling continues across south Lebanon", pressure)).toBe(true);
  });

  it("ignores a country having an ordinary week", () => {
    expect(PRESSURE_RATIO_FLOOR).toBe(2);
    // Israel is present in the ledger but at 1.1x its own baseline.
    expect(namesPressureCountry("Israeli forces move north", pressure)).toBe(false);
  });

  it("marks which countries the ledger mentions and which it passes over", () => {
    expect(
      markCoverage(pressure, ["Shelling continues across south Lebanon after nightfall"]),
    ).toEqual([
      { code: "LE", country: "Lebanon", events: 70, ratio: 5.4, named: true },
      { code: "IS", country: "Israel", events: 48, ratio: 1.1, named: false },
    ]);
  });
});
