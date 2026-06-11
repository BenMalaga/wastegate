// GitHub-hosted runner pricing, US dollars per minute, standard 2-core runners.
// Source: GitHub Actions billing (per-minute rates as of 2026). These are the
// marginal cost beyond your plan's included minutes. Override with --rate-* flags
// for larger runners or self-hosted ($0). GitHub bills each JOB rounded up to the
// whole minute, which is why cost is computed per job, not per run.
export const DEFAULT_RATES = {
  UBUNTU: 0.008,
  WINDOWS: 0.016,
  MACOS: 0.08,
};

// Compute USD for a run from its JOBS (started_at → completed_at durations),
// rounding each job up to the whole minute exactly as GitHub bills, and pricing
// each by the runner OS inferred from its labels. We deliberately use wall-clock
// job durations rather than the /timing `billable` field, because public repos
// get unlimited free minutes — their `billable` is always 0. Duration-based cost
// answers the question that actually matters: "what would this cost on a private
// repo / your plan's metered minutes?" Identical math for public and private.
export function costOfJobs(jobs, rates = DEFAULT_RATES) {
  let usd = 0;
  for (const j of jobs || []) {
    if (!j.started_at || !j.completed_at) continue;
    const minutes = (Date.parse(j.completed_at) - Date.parse(j.started_at)) / 60000;
    if (!(minutes > 0)) continue;
    const os = osFromLabels(j.labels);
    usd += Math.ceil(minutes) * (rates[os] ?? rates.UBUNTU);
  }
  return usd;
}

export function osFromLabels(labels = []) {
  const s = (labels || []).join(" ").toLowerCase();
  if (s.includes("windows")) return "WINDOWS";
  if (s.includes("macos") || s.includes("mac-")) return "MACOS";
  return "UBUNTU";
}

export function fmtUsd(n) {
  return `$${n.toFixed(2)}`;
}
