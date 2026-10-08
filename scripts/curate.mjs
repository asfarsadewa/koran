#!/usr/bin/env node
/**
 * Runs one sheet by hand with the same prompt its schedule sends.
 *
 *   node scripts/curate.mjs hari_ini
 *   node scripts/curate.mjs kemarin
 *
 * eve no longer runs a local agent from `eve invoke`; it invokes a running agent
 * over HTTP with `eve remote invoke`. The target defaults to the local
 * `eve dev --no-ui` server on port 2000. Set EVE_AGENT_URL to aim it elsewhere,
 * such as the production deployment, which then publishes to the live paper.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEDULES = { hari_ini: "edisi-pagi.md", kemarin: "edisi-kemarin.md" };
const DEFAULT_AGENT_URL = "http://127.0.0.1:2000";

const kind = process.argv[2];
if (!(kind in SCHEDULES)) {
  console.error(`Usage: node scripts/curate.mjs <${Object.keys(SCHEDULES).join("|")}>`);
  process.exit(2);
}

// The schedule file is front matter followed by the prompt itself.
const schedule = readFileSync(join(ROOT, "agent", "schedules", SCHEDULES[kind]), "utf8");
const prompt = schedule.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, "").trim();
if (!prompt) throw new Error(`No prompt found in agent/schedules/${SCHEDULES[kind]}`);

const url = process.env.EVE_AGENT_URL || DEFAULT_AGENT_URL;
console.error(`Invoking ${kind} on ${url}`);

const result = spawnSync(
  process.execPath,
  [join(ROOT, "node_modules", "eve", "bin", "eve.js"), "remote", "invoke", "--url", url, prompt],
  { cwd: ROOT, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
