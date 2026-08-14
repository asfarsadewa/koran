import { describe, expect, it } from "vitest";

import { classifyWindowFit } from "../agent/lib/historical-window";

const editionParts = { year: 1991, month: 8, day: 13 };

const fit = (month: number, day: number, end?: { month: number; day: number }, year = 1991) =>
  classifyWindowFit(
    editionParts,
    { year, month, day },
    end ? { year, month: end.month, day: end.day } : null,
  );

describe("historical date semantics", () => {
  it("treats the printed day and the evening before as the print cycle", () => {
    expect(fit(8, 13)).toEqual({ fit: "exact", dayOffset: 0 });
    expect(fit(8, 12)).toEqual({ fit: "exact", dayOffset: -1 });
  });

  it("treats one day either side as adjacent", () => {
    expect(fit(8, 14)).toEqual({ fit: "adjacent", dayOffset: 1 });
    expect(fit(8, 11)).toEqual({ fit: "adjacent", dayOffset: -2 });
  });

  it("treats an earlier start inside the lookback as ongoing", () => {
    expect(fit(8, 10)).toEqual({ fit: "ongoing", dayOffset: -3 });
    expect(fit(7, 14)).toEqual({ fit: "ongoing", dayOffset: -30 });
  });

  it("treats a dated range straddling the printed day as ongoing however early it began", () => {
    expect(fit(6, 1, { month: 8, day: 20 })).toEqual({ fit: "ongoing", dayOffset: -73 });
  });

  it("refuses events the paper could not yet have known", () => {
    expect(fit(8, 15)).toBeNull();
    expect(fit(8, 19)).toBeNull();
    // A range that has not begun by press time is still the future.
    expect(fit(8, 17, { month: 8, day: 20 })).toBeNull();
  });

  it("refuses events too far back to still be running that morning", () => {
    expect(fit(7, 13)).toBeNull();
    expect(fit(8, 13, undefined, 1990)).toBeNull();
  });
});
