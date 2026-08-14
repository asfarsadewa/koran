/**
 * Coverage pressure for the Kemarin sheet.
 *
 * GDELT's historical archive records that something violent happened, where, and
 * between whom. For the years this sheet prints it records nothing else: the 1991
 * rows carry no headline, no summary and no source URL — that column only appears
 * from 2013 — so a GDELT row can never become a candidate or serve as evidence.
 *
 * What it can do is tell the desk where the day was violent, which is precisely
 * what a chronology written decades later by mostly Western editors leaves out. So
 * it is used here for one thing: naming the countries under unusual conflict on the
 * printed day, and saying which of them no candidate so much as mentions.
 *
 * Pressure is measured against each country's own yearly baseline rather than by
 * raw volume, because raw volume in this era measures wire attention — the United
 * States and United Kingdom lead nearly every day — and ranking by it would push
 * the sheet toward the media centres the editorial standard exists to look past.
 */
import { GDELT_CONFLICT_COUNTRIES, GDELT_CONFLICT_DAYS } from "./gdelt-conflict-index";

export interface ConflictPressure {
  code: string;
  country: string;
  events: number;
  /** That day's material-conflict count against the country's mean day for the year. */
  ratio: number;
}

export interface ConflictCoverage extends ConflictPressure {
  /** Whether any candidate in the ledger names this country at all. */
  named: boolean;
}

/** Below this a country is simply having an ordinary week. */
export const PRESSURE_RATIO_FLOOR = 2;

/**
 * Matches a country name at a word start but not at a word end, so `Israel` reads
 * `Israeli` and `Iraq` reads `Iraqi`. Demonyms that drop a letter — `Somali` for
 * `Somalia`, `Turkish` for `Turkey` — are missed, which is why an unnamed country
 * is reported as unnamed rather than as uncovered.
 */
function countryPattern(country: string): RegExp {
  return new RegExp(`\\b${country.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "iu");
}

export function parseConflictDay(encoded: string): ConflictPressure[] {
  const pressure: ConflictPressure[] = [];
  for (const entry of encoded.split(",")) {
    const [code, events, ratio] = entry.split(":");
    if (!code || !events || !ratio) continue;
    pressure.push({
      code,
      country: GDELT_CONFLICT_COUNTRIES[code] ?? code,
      events: Number(events),
      ratio: Number(ratio),
    });
  }
  return pressure;
}

/**
 * Returns null when the printed year is not in the index, which is a maintenance
 * fact worth reporting rather than an absence of conflict worth hiding.
 */
export function conflictPressureFor(editionDate: string): ConflictPressure[] | null {
  const match = /^(\d{4})-(\d{2}-\d{2})$/u.exec(editionDate);
  if (!match) return null;
  const year = GDELT_CONFLICT_DAYS[match[1] ?? ""];
  if (!year) return null;
  const day = year[match[2] ?? ""];
  return day ? parseConflictDay(day) : [];
}

export function namesPressureCountry(text: string, pressure: ConflictPressure[]): boolean {
  return pressure.some(
    (entry) => entry.ratio >= PRESSURE_RATIO_FLOOR && countryPattern(entry.country).test(text),
  );
}

/** Marks which countries under pressure the ledger actually mentions. */
export function markCoverage(
  pressure: ConflictPressure[],
  texts: string[],
): ConflictCoverage[] {
  return pressure.map((entry) => {
    const pattern = countryPattern(entry.country);
    return { ...entry, named: texts.some((text) => pattern.test(text)) };
  });
}

export const INDEXED_YEARS = Object.keys(GDELT_CONFLICT_DAYS);
