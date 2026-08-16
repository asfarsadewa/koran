/**
 * Date semantics for the Kemarin sheet.
 *
 * Archives publish dates, not instants, so a candidate is placed by calendar
 * distance from the printed day rather than by pretending the 36-hour editorial
 * window has minute precision:
 *
 * - `exact`    — the printed day itself, or the evening before, which is the copy
 *                a morning paper would actually carry;
 * - `adjacent` — two days before, where the editorial window still reaches: it
 *                opens at seven in the evening on that day;
 * - `ongoing`  — a dated range that began earlier and had not closed by the
 *                printed day, which is the only evidence the archive offers that
 *                a crisis was still running that morning;
 * - `recent`   — a single-date event inside the lookback. It happened before the
 *                sheet went to press and may still be worth the page, but nothing
 *                in the record says it was still happening.
 *
 * Nothing dated after the printed day is admitted. The window closes at seven in
 * the morning on the printed day, and no time zone reaches across that: midnight
 * on the following day at UTC+14, the earliest the date turns anywhere on earth,
 * is still eleven hours after the presses ran. A later date is not a rounding
 * question, it is the future.
 */
export const HISTORICAL_WINDOW_FITS = ["exact", "adjacent", "ongoing", "recent"] as const;

export type HistoricalWindowFit = (typeof HISTORICAL_WINDOW_FITS)[number];

/** How far back a single-date event may sit and still be offered as recent context. */
export const RECENT_LOOKBACK_DAYS = 30;

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
 * Without an end day there is no such evidence, and the event is `recent` rather
 * than `ongoing` however close it fell.
 */
export function classifyWindowFit(
  edition: DateParts,
  start: DateParts,
  end?: DateParts | null,
): WindowFitResult | null {
  const startDelta = dayDelta(edition, start);
  const endDelta = end ? dayDelta(edition, end) : startDelta;
  if (startDelta > 0) return null;
  if (startDelta === 0 || startDelta === -1) return { fit: "exact", dayOffset: startDelta };
  if (endDelta >= 0) return { fit: "ongoing", dayOffset: startDelta };
  if (startDelta === -2) return { fit: "adjacent", dayOffset: startDelta };
  if (startDelta >= -RECENT_LOOKBACK_DAYS) return { fit: "recent", dayOffset: startDelta };
  return null;
}
