import { describe, expect, it } from "vitest";

import {
  conflictPressureFor,
  INDEXED_YEARS,
  markCoverage,
  namesPressureCountry,
  parseConflictDay,
  PRESSURE_RATIO_FLOOR,
} from "../agent/lib/gdelt-conflict";

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
