// The waste analyses. Pure functions over an array of enriched run records, so
// they unit-test without touching the network. Each returns a finding with the
// dollars wasted, the offending runs, and the exact config fix — and every
// dollar figure carries its arithmetic, because the whole point is that a
// skeptical engineer can audit it instead of trusting a black box.
//
// Enriched run shape (see fetch.js):
//   { id, name, workflowId, workflowName, branch, event, status, conclusion,
//     attempt, startedAt (ms), completedAt (ms), durationMin, costUsd,
//     prNumbers: number[] }

const FAILED = new Set(["failure", "timed_out", "startup_failure"]);

// 1) Late-failure spend. A run that ends in failure produced no green build —
//    every minute it burned is waste, and the later it died, the more it cost.
//    Surfaces the total and the most expensive late failures.
export function lateFailureWaste(runs) {
  const failed = runs.filter((r) => FAILED.has(r.conclusion) && r.costUsd > 0);
  const usd = sum(failed.map((r) => r.costUsd));
  const offenders = [...failed]
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, 5)
    .map((r) => ({
      label: `${r.workflowName} on ${r.branch}`,
      detail: `failed after ${r.durationMin.toFixed(0)} min`,
      usd: r.costUsd,
    }));
  return {
    key: "late-failure",
    title: "Spend on failed runs",
    usd,
    count: failed.length,
    arithmetic: `${failed.length} failed runs × their billable minutes`,
    offenders,
    fix:
      "Order jobs cheapest-first and fail fast: run lint/typecheck/unit before slow\n" +
      "integration/e2e jobs, add `timeout-minutes:` to long jobs, and cache builds so a\n" +
      "doomed run dies in minute 2, not minute 22.",
  };
}

// 2) Superseded-run spend (missed cancellation). When a newer run starts on the
//    same workflow+branch before the older one finishes, a `concurrency` block
//    with cancel-in-progress would have killed the older run. Its minutes were
//    spent computing a result nobody waited for. This analysis exists in no other
//    tool — it's a counterfactual over real run timestamps.
export function supersededWaste(runs) {
  const groups = new Map();
  for (const r of runs) {
    if (r.startedAt == null || r.completedAt == null) continue;
    const k = `${r.workflowId}\x00${r.branch}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const superseded = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.startedAt - b.startedAt);
    for (let i = 0; i < group.length; i++) {
      const r = group[i];
      if (r.conclusion === "cancelled") continue; // already cancelled — no waste
      // Superseded if any LATER run in the same group started before r finished.
      const wasSuperseded = group.slice(i + 1).some((later) => later.startedAt < r.completedAt);
      if (wasSuperseded && r.costUsd > 0) superseded.push(r);
    }
  }

  const usd = sum(superseded.map((r) => r.costUsd));
  const offenders = [...superseded]
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, 5)
    .map((r) => ({
      label: `${r.workflowName} on ${r.branch}`,
      detail: `ran to completion though a newer push superseded it`,
      usd: r.costUsd,
    }));
  return {
    key: "superseded",
    title: "Runs a concurrency block would have cancelled",
    usd,
    count: superseded.length,
    arithmetic: `${superseded.length} runs that overlapped a newer run on the same workflow+branch`,
    offenders,
    fix:
      "Add a concurrency group so a new push cancels the in-flight run:\n\n" +
      "  concurrency:\n" +
      "    group: ${{ github.workflow }}-${{ github.ref }}\n" +
      "    cancel-in-progress: true",
  };
}

// 3) Retry spend. A run with attempt > 1 was re-run because an earlier attempt
//    failed — usually flake. The earlier attempts' minutes are waste. Without
//    per-attempt billing we attribute a conservative share of the run's cost to
//    the wasted earlier attempts.
export function retryWaste(runs) {
  const retried = runs.filter((r) => r.attempt > 1 && r.costUsd > 0);
  // Each earlier attempt cost roughly the same as the final one. Attribute
  // (attempt-1)/attempt of the observed cost to the wasted earlier runs.
  const items = retried.map((r) => ({ run: r, wasted: r.costUsd * ((r.attempt - 1) / r.attempt) }));
  const usd = sum(items.map((i) => i.wasted));
  const offenders = [...items]
    .sort((a, b) => b.wasted - a.wasted)
    .slice(0, 5)
    .map((i) => ({
      label: `${i.run.workflowName} on ${i.run.branch}`,
      detail: `re-run ${i.run.attempt - 1}× before passing`,
      usd: i.wasted,
    }));
  return {
    key: "retry",
    title: "Spend on re-run (flaky) attempts",
    usd,
    count: retried.length,
    arithmetic: `${retried.length} runs with >1 attempt, charging (attempt−1)/attempt of cost as waste (estimate)`,
    offenders,
    fix:
      "Re-runs are flaky tests with a dollar sign. Quarantine the flakers, pin their\n" +
      "seeds/timeouts, and stop blanket `re-run all jobs` — re-run only the failed job.",
  };
}

export function analyzeAll(runs) {
  return [lateFailureWaste(runs), supersededWaste(runs), retryWaste(runs)]
    .filter((f) => f.usd > 0)
    .sort((a, b) => b.usd - a.usd);
}

export function totalSpend(runs) {
  return sum(runs.map((r) => r.costUsd));
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}
