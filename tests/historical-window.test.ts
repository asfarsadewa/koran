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

  it("reaches back two days, where the editorial window still opens", () => {
    expect(fit(8, 11)).toEqual({ fit: "adjacent", dayOffset: -2 });
  });

  it("calls an earlier single date recent, because nothing says it was still running", () => {
    expect(fit(8, 10)).toEqual({ fit: "recent", dayOffset: -3 });
    expect(fit(7, 14)).toEqual({ fit: "recent", dayOffset: -30 });
    // Two days back is still adjacent; the recent lookback begins beyond it.
    expect(fit(8, 11)?.fit).not.toBe("recent");
  });

  it("calls a dated range straddling the printed day ongoing however early it began", () => {
    expect(fit(6, 1, { month: 8, day: 20 })).toEqual({ fit: "ongoing", dayOffset: -73 });
    // A range that closed before press time describes something finished.
    expect(fit(8, 4, { month: 8, day: 6 })).toEqual({ fit: "recent", dayOffset: -9 });
    // Straddling outranks the plain distance test, so two days back is ongoing here.
    expect(fit(8, 11, { month: 8, day: 16 })).toEqual({ fit: "ongoing", dayOffset: -2 });
  });

  it("refuses events the paper could not yet have known", () => {
    // No time zone reaches the day after: midnight at UTC+14 is still eleven hours
    // past a seven o'clock press run in Perth.
    expect(fit(8, 14)).toBeNull();
    expect(fit(8, 15)).toBeNull();
    expect(fit(8, 19)).toBeNull();
    // A range that has not begun by press time is still the future.
    expect(fit(8, 14, { month: 8, day: 20 })).toBeNull();
    expect(fit(8, 17, { month: 8, day: 20 })).toBeNull();
  });

  it("refuses events too far back to still be running that morning", () => {
    expect(fit(7, 13)).toBeNull();
    expect(fit(8, 13, undefined, 1990)).toBeNull();
  });

  it("never returns a positive day offset", () => {
    for (let day = 1; day <= 31; day += 1) {
      expect(classifyWindowFit(editionParts, { year: 1991, month: 8, day })?.dayOffset ?? 0)
        .toBeLessThanOrEqual(0);
    }
  });
});
