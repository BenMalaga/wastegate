import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ghApi } from "./gh.js";
import { costOfJobs } from "./pricing.js";

// Pull the run history for a repo over a window and enrich each completed run
// with its billable cost from the /timing endpoint. Timings for completed runs
// are immutable, so they're cached on disk — a second pass over the same window
// is near-instant and spends almost no API quota.

function cacheDir() {
  const dir = join(tmpdir(), "wastegate-cache");
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Cache format version — bump when the cached shape changes so stale entries
// from older wastegate versions are simply ignored, never misread.
const CACHE_V = "v2";

function readCache(repo) {
  const f = join(cacheDir(), `${repo.replace("/", "__")}.${CACHE_V}.json`);
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return {};
  }
}

function writeCache(repo, data) {
  writeFileSync(join(cacheDir(), `${repo.replace("/", "__")}.${CACHE_V}.json`), JSON.stringify(data));
}

// Date math without Date.now(): the caller passes `sinceISO` (computed once at
// startup) so this module stays deterministic and testable.
export function listRuns(repo, sinceISO, { maxPages = 20, onProgress } = {}) {
  const runs = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = ghApi(`/repos/${repo}/actions/runs?per_page=100&page=${page}&created=>=${sinceISO}`);
    const batch = res.workflow_runs || [];
    if (batch.length === 0) break;
    runs.push(...batch);
    onProgress?.({ phase: "list", fetched: runs.length, total: res.total_count });
    if (runs.length >= (res.total_count || runs.length)) break;
  }
  return runs;
}

export function enrichRuns(repo, rawRuns, { rates, onProgress } = {}) {
  const cache = readCache(repo);
  const completed = rawRuns.filter((r) => r.status === "completed");
  const enriched = [];

  for (let i = 0; i < completed.length; i++) {
    const r = completed[i];
    let jobs = cache[r.id];
    if (jobs === undefined) {
      try {
        jobs = (ghApi(`/repos/${repo}/actions/runs/${r.id}/jobs?per_page=100`).jobs || []).map((j) => ({
          name: j.name,
          conclusion: j.conclusion,
          started_at: j.started_at,
          completed_at: j.completed_at,
          labels: j.labels,
        }));
      } catch {
        jobs = [];
      }
      cache[r.id] = jobs;
    }
    const startedAt = r.run_started_at ? Date.parse(r.run_started_at) : null;
    const completedAt = r.updated_at ? Date.parse(r.updated_at) : null;
    const costUsd = costOfJobs(jobs, rates);
    enriched.push({
      id: r.id,
      name: r.name,
      workflowId: r.workflow_id,
      workflowName: r.name || `workflow ${r.workflow_id}`,
      branch: r.head_branch || "(unknown)",
      event: r.event,
      status: r.status,
      conclusion: r.conclusion,
      attempt: r.run_attempt || 1,
      startedAt,
      completedAt,
      durationMin: startedAt != null && completedAt != null ? (completedAt - startedAt) / 60000 : 0,
      costUsd,
      prNumbers: (r.pull_requests || []).map((p) => p.number),
    });
    onProgress?.({ phase: "timing", fetched: i + 1, total: completed.length });
  }

  writeCache(repo, cache);
  return enriched;
}
