/**
 * Date semantics for the Kemarin sheet.
 *
 * Archives publish dates, not instants, so a candidate is placed by calendar
 * distance from the printed day rather than by pretending the 36-hour editorial
 * window has minute precision:
 *
 * - `exact`    — the printed day itself, or the evening before, which is the copy
 *                a morning paper would actually carry;
 * - `adjacent` — one day either side, covering time-zone slip in old records and
 *                wire copy that landed around press time;
 * - `ongoing`  — a crisis that began earlier and was still running that morning.
 *
 * Anything further into the future is dropped. A paper printed on 15 August 1991
 * cannot report the coup of 19 August, and treating that as eligible is exactly
 * the historical omniscience this sheet exists to avoid.
 */
export const HISTORICAL_WINDOW_FITS = ["exact", "adjacent", "ongoing"] as const;

export type HistoricalWindowFit = (typeof HISTORICAL_WINDOW_FITS)[number];

/** How long ago a crisis may have started and still count as running on the printed day. */
export const ONGOING_LOOKBACK_DAYS = 30;

export const DAY_MS = 86_400_000;

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function dayDelta(edition: DateParts, event: DateParts): number {
  return (
    (Date.UTC(event.year, event.month - 1, event.day) -
      Date.UTC(edition.year, edition.month - 1, edition.day)) /
    DAY_MS
  );
}

export interface WindowFitResult {
  fit: HistoricalWindowFit;
  dayOffset: number;
}

/**
 * `end` carries the closing day of a dated range such as `August 17–20`. A range
 * straddling the printed day is the clearest evidence a crisis was still running
 * that morning, so it outranks the plain distance test and ignores the lookback.
 */
export function classifyWindowFit(
  edition: DateParts,
  start: DateParts,
  end?: DateParts | null,
): WindowFitResult | null {
  const startDelta = dayDelta(edition, start);
  const endDelta = end ? dayDelta(edition, end) : startDelta;
  if (startDelta === 0 || startDelta === -1) return { fit: "exact", dayOffset: startDelta };
  if (startDelta < 0 && endDelta >= 0) return { fit: "ongoing", dayOffset: startDelta };
  if (startDelta === 1 || startDelta === -2) return { fit: "adjacent", dayOffset: startDelta };
  if (startDelta < -2 && startDelta >= -ONGOING_LOOKBACK_DAYS) {
    return { fit: "ongoing", dayOffset: startDelta };
  }
  return null;
}
