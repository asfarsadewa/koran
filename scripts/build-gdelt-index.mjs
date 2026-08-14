#!/usr/bin/env node
/**
 * Builds the GDELT conflict-pressure index the Kemarin sheet reads.
 *
 *   node scripts/build-gdelt-index.mjs 1991 1992
 *
 * GDELT's historical archive (1979–2005) is published as one zip per year — 48 MB
 * compressed and 395 MB of TSV for 1991 — with no per-day files and no byte-range
 * support. Downloading that on every run to read a single day would be absurd, so
 * the whole year is reduced once, here, to the only thing the desk needs: which
 * countries saw unusual material conflict on each date.
 *
 * The reduction is by anomaly, not raw volume. Raw volume in the 1991 data is a
 * measure of wire attention — the United States and United Kingdom sit at the top
 * of almost every day — so ranking by it would push the sheet toward exactly the
 * media centres the editorial standard tells it to look past. Measuring each
 * country against its own yearly baseline surfaces Burundi, Papua New Guinea and
 * Guatemala instead.
 *
 * Pass every year you want present: the file is rewritten, not merged into.
 */
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { createInflateRaw } from "node:zlib";

const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), "..", "agent", "lib", "gdelt-conflict-index.ts");

/** GDELT 1.0 event columns, one-indexed as the codebook numbers them. */
const COLUMN = {
  sqlDate: 2,
  quadClass: 30,
  numArticles: 34,
  actionGeoFullName: 51,
  actionGeoCountryCode: 52,
};

/** CAMEO quad class 4 is material conflict: the assaults, fights and mass violence. */
const MATERIAL_CONFLICT = "4";

/** Below this a ratio is arithmetic noise against a near-zero baseline. */
const MIN_EVENTS = 4;

/** Countries kept per day, ranked by anomaly. */
const TOP_COUNTRIES = 12;

function fail(message) {
  console.error(`gdelt: ${message}`);
  process.exit(1);
}

/**
 * GDELT year archives hold exactly one member, so the local file header alone is
 * enough to find the deflate stream — no central directory walk, no dependency.
 */
function singleZipEntry(buffer) {
  if (buffer.readUInt32LE(0) !== 0x04034b50) fail("archive does not start with a local file header");
  if (buffer.readUInt16LE(8) !== 8) fail("archive member is not deflate-compressed");
  const compressedSize = buffer.readUInt32LE(18);
  if (compressedSize === 0) fail("archive member has a streamed size this script cannot follow");
  const nameLength = buffer.readUInt16LE(26);
  const extraLength = buffer.readUInt16LE(28);
  const start = 30 + nameLength + extraLength;
  return {
    name: buffer.subarray(30, 30 + nameLength).toString("latin1"),
    data: buffer.subarray(start, start + compressedSize),
  };
}

async function readYear(year) {
  const url = `http://data.gdeltproject.org/events/${year}.zip`;
  process.stderr.write(`gdelt: downloading ${url}\n`);
  const response = await fetch(url);
  if (!response.ok) fail(`${url} answered HTTP ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const entry = singleZipEntry(archive);
  process.stderr.write(`gdelt: reading ${entry.name} (${archive.length} bytes compressed)\n`);

  const days = new Map();
  const totals = new Map();
  const names = new Map();
  let rows = 0;

  const lines = createInterface({
    input: Readable.from([entry.data]).pipe(createInflateRaw()),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    if (!line) continue;
    const columns = line.split("\t");
    if (columns[COLUMN.quadClass - 1] !== MATERIAL_CONFLICT) continue;
    const code = columns[COLUMN.actionGeoCountryCode - 1];
    const date = columns[COLUMN.sqlDate - 1];
    if (!code || !/^\d{8}$/.test(date ?? "")) continue;
    rows += 1;

    // The place name ends with its country, so the archive names itself and no
    // separate FIPS lookup has to be carried in the repository.
    const place = columns[COLUMN.actionGeoFullName - 1] ?? "";
    const country = place.split(", ").at(-1)?.trim();
    if (country && !names.has(code)) names.set(code, country);

    const articles = Number(columns[COLUMN.numArticles - 1]) || 0;
    const key = `${date.slice(4, 6)}-${date.slice(6, 8)}`;
    let day = days.get(key);
    if (!day) days.set(key, (day = new Map()));
    const tally = day.get(code) ?? { events: 0, articles: 0 };
    tally.events += 1;
    tally.articles += articles;
    day.set(code, tally);
    totals.set(code, (totals.get(code) ?? 0) + 1);
  }

  const dayCount = days.size;
  if (!dayCount) fail(`${year} produced no material-conflict rows`);
  process.stderr.write(`gdelt: ${rows} material-conflict rows across ${dayCount} days\n`);

  const encoded = {};
  for (const [key, day] of [...days.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const ranked = [...day.entries()]
      .filter(([, tally]) => tally.events >= MIN_EVENTS)
      .map(([code, tally]) => ({
        code,
        events: tally.events,
        ratio: tally.events / ((totals.get(code) ?? 1) / dayCount),
      }))
      .sort((left, right) => right.ratio - left.ratio || right.events - left.events)
      .slice(0, TOP_COUNTRIES);
    if (ranked.length) {
      encoded[key] = ranked
        .map((entry) => `${entry.code}:${entry.events}:${entry.ratio.toFixed(1)}`)
        .join(",");
    }
  }

  return { encoded, names };
}

const years = process.argv.slice(2).filter((value) => /^\d{4}$/.test(value));
if (!years.length) fail("pass at least one four-digit year; every year you want present must be listed");

const countries = new Map();
const byYear = {};
for (const year of years) {
  const { encoded, names } = await readYear(year);
  byYear[year] = encoded;
  for (const [code, name] of names) if (!countries.has(code)) countries.set(code, name);
}

const quote = (value) => JSON.stringify(value);
const sorted = [...countries.entries()].sort(([left], [right]) => left.localeCompare(right));

await mkdir(dirname(OUTPUT), { recursive: true });
const out = createWriteStream(OUTPUT);
out.write(`// Generated by scripts/build-gdelt-index.mjs — do not edit by hand.\n`);
out.write(`// Years: ${years.join(", ")}. Source: http://data.gdeltproject.org/events/<year>.zip\n`);
out.write(`// Each day lists the countries with the most anomalous material conflict as\n`);
out.write(`// "FIPS:events:ratio", ratio being that day against the country's own yearly mean.\n\n`);
out.write(`export const GDELT_CONFLICT_COUNTRIES: Record<string, string> = {\n`);
for (const [code, name] of sorted) out.write(`  ${quote(code)}: ${quote(name)},\n`);
out.write(`};\n\nexport const GDELT_CONFLICT_DAYS: Record<string, Record<string, string>> = {\n`);
for (const year of years) {
  out.write(`  ${quote(year)}: {\n`);
  for (const [key, value] of Object.entries(byYear[year])) {
    out.write(`    ${quote(key)}: ${quote(value)},\n`);
  }
  out.write(`  },\n`);
}
out.write(`};\n`);
out.end();

process.stderr.write(`gdelt: wrote ${OUTPUT}\n`);
