import { argv, exit, stdout, stderr } from "node:process";
import { createRequire } from "node:module";
import { ghAvailable, ghAuthed, resolveRepo, GhError } from "./gh.js";
import { listRuns, enrichRuns } from "./fetch.js";
import { analyzeAll, totalSpend } from "./analyze.js";
import { renderTerminal, renderJson, renderMarkdown } from "./report.js";
import { DEFAULT_RATES } from "./pricing.js";

const VERSION = createRequire(import.meta.url)("../package.json").version;

function fail(msg) {
  stderr.write(`wastegate: ${msg}\n`);
  exit(2);
}

function parseArgs(args) {
  const opts = { repo: null, days: 30, format: "terminal", rates: { ...DEFAULT_RATES } };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const take = () => {
      const v = args[++i];
      if (v == null) fail(`${a} needs a value`);
      return v;
    };
    if (a === "--days" || a === "-d") opts.days = Number(take());
    else if (a === "--json") opts.format = "json";
    else if (a === "--markdown" || a === "--md") opts.format = "markdown";
    else if (a === "--rate-ubuntu") opts.rates.UBUNTU = Number(take());
    else if (a === "--rate-windows") opts.rates.WINDOWS = Number(take());
    else if (a === "--rate-macos") opts.rates.MACOS = Number(take());
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "-v" || a === "--version") opts.version = true;
    else if (!a.startsWith("-") && !opts.repo) opts.repo = a;
    else fail(`unknown option: ${a}`);
  }
  if (!Number.isFinite(opts.days) || opts.days <= 0) fail("--days must be a positive number");
  return opts;
}

function printHelp() {
  stdout.write(`wastegate ${VERSION} — dollar-denominated waste forensics for GitHub Actions.

Audits your Actions run history and prints, in dollars, which specific waste is
costing you and the exact config fix for each. Local and read-only: it uses your
existing \`gh\` auth and changes nothing.

Usage:
  wastegate [owner/repo] [options]

  Run inside a repo to audit it, or pass an explicit owner/repo (any public repo
  works — try it on someone else's).

Options:
  -d, --days <n>       Days of history to analyze. Default: 30.
      --json           Machine-readable JSON output.
      --md, --markdown Markdown (for pasting into an issue or PR).
      --rate-ubuntu <usd>   Per-minute rates (defaults: ubuntu 0.008,
      --rate-windows <usd>  windows 0.016, macos 0.08). Set to 0 for self-hosted.
      --rate-macos <usd>
  -h, --help           Show this help.
  -v, --version        Show version.

Examples:
  wastegate                          # audit the current repo, last 30 days
  wastegate facebook/react --days 14 # audit any public repo
  wastegate --md > waste.md          # a report to paste into a PR

What it finds (each with the YAML fix and the arithmetic shown):
  · runs a concurrency block would have cancelled  (a counterfactual no other tool runs)
  · spend on failed runs, weighted by how late they died
  · spend on re-run (flaky) attempts
`);
}

export async function main() {
  const opts = parseArgs(argv.slice(2));
  if (opts.version) return void stdout.write(`wastegate ${VERSION}\n`);
  if (opts.help) return void printHelp();

  if (!ghAvailable()) fail("the GitHub CLI `gh` is required. Install it from https://cli.github.com and run `gh auth login`.");
  if (!ghAuthed()) fail("`gh` is not authenticated. Run `gh auth login` first.");

  let repo;
  try {
    repo = resolveRepo(opts.repo);
  } catch (e) {
    fail(e instanceof GhError ? e.message : String(e));
  }

  // Compute the window start once, deterministically.
  const since = new Date(Date.now() - opts.days * 86400000).toISOString().slice(0, 10);

  const tick = (label) => ({ fetched, total }) => {
    if (stdout.isTTY) stdout.write(`\r\x1b[2K${label} ${fetched}${total ? `/${total}` : ""}…`);
  };

  let raw, runs;
  try {
    raw = listRuns(repo, since, { onProgress: tick("Listing runs") });
    runs = enrichRuns(repo, raw, { rates: opts.rates, onProgress: tick("Reading timings") });
  } catch (e) {
    if (stdout.isTTY) stdout.write("\r\x1b[2K");
    fail(e instanceof GhError ? e.message : String(e?.message || e));
  }
  if (stdout.isTTY) stdout.write("\r\x1b[2K");

  if (runs.length === 0) {
    fail(`no completed Actions runs for ${repo} in the last ${opts.days} days.`);
  }

  const findings = analyzeAll(runs);
  const payload = { repo, days: opts.days, totalSpend: totalSpend(runs), findings, runCount: runs.length };

  if (opts.format === "json") stdout.write(renderJson(payload));
  else if (opts.format === "markdown") stdout.write(renderMarkdown(payload));
  else stdout.write(renderTerminal(payload));
}
