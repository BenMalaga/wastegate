import { test } from "node:test";
import assert from "node:assert/strict";
import { lateFailureWaste, supersededWaste, retryWaste, analyzeAll, totalSpend } from "../src/analyze.js";
import { costOfJobs, osFromLabels } from "../src/pricing.js";

const MIN = 60000;
function run(o) {
  return {
    id: o.id,
    workflowId: o.workflowId ?? 1,
    workflowName: o.workflowName ?? "CI",
    branch: o.branch ?? "main",
    conclusion: o.conclusion ?? "success",
    attempt: o.attempt ?? 1,
    startedAt: o.startedAt ?? 0,
    completedAt: o.completedAt ?? 10 * MIN,
    durationMin: o.durationMin ?? 10,
    costUsd: o.costUsd ?? 1,
    prNumbers: o.prNumbers ?? [],
    event: o.event ?? "push",
    status: "completed",
  };
}

test("lateFailureWaste sums only failed runs", () => {
  const runs = [
    run({ id: 1, conclusion: "success", costUsd: 5 }),
    run({ id: 2, conclusion: "failure", costUsd: 3 }),
    run({ id: 3, conclusion: "timed_out", costUsd: 2 }),
    run({ id: 4, conclusion: "cancelled", costUsd: 9 }),
  ];
  const f = lateFailureWaste(runs);
  assert.equal(f.usd, 5); // 3 + 2, not the success or cancelled
  assert.equal(f.count, 2);
});

test("supersededWaste flags an older run overlapped by a newer one on the same workflow+branch", () => {
  const runs = [
    run({ id: 1, branch: "feature", startedAt: 0, completedAt: 20 * MIN, costUsd: 4 }), // superseded
    run({ id: 2, branch: "feature", startedAt: 5 * MIN, completedAt: 25 * MIN, costUsd: 4 }), // the newer push
  ];
  const f = supersededWaste(runs);
  assert.equal(f.count, 1, "only the older run is wasted");
  assert.equal(f.usd, 4);
});

test("supersededWaste does not flag sequential (non-overlapping) runs", () => {
  const runs = [
    run({ id: 1, branch: "main", startedAt: 0, completedAt: 10 * MIN, costUsd: 4 }),
    run({ id: 2, branch: "main", startedAt: 11 * MIN, completedAt: 21 * MIN, costUsd: 4 }),
  ];
  assert.equal(supersededWaste(runs).usd, 0);
});

test("supersededWaste does not double-count already-cancelled runs", () => {
  const runs = [
    run({ id: 1, branch: "x", startedAt: 0, completedAt: 20 * MIN, costUsd: 4, conclusion: "cancelled" }),
    run({ id: 2, branch: "x", startedAt: 5 * MIN, completedAt: 25 * MIN, costUsd: 4 }),
  ];
  assert.equal(supersededWaste(runs).usd, 0, "already cancelled → no missed-cancellation waste");
});

test("supersededWaste separates different branches and workflows", () => {
  const runs = [
    run({ id: 1, workflowId: 1, branch: "a", startedAt: 0, completedAt: 20 * MIN, costUsd: 4 }),
    run({ id: 2, workflowId: 1, branch: "b", startedAt: 5 * MIN, completedAt: 25 * MIN, costUsd: 4 }),
  ];
  assert.equal(supersededWaste(runs).usd, 0, "different branches never supersede each other");
});

test("retryWaste attributes a share of cost to re-run attempts", () => {
  const runs = [run({ id: 1, attempt: 2, costUsd: 10 })];
  const f = retryWaste(runs);
  assert.equal(f.usd, 5); // (2-1)/2 * 10
  assert.equal(f.count, 1);
});

test("analyzeAll drops zero-waste findings and sorts by dollars", () => {
  const runs = [
    run({ id: 1, conclusion: "failure", costUsd: 2 }),
    run({ id: 2, branch: "z", startedAt: 0, completedAt: 30 * MIN, costUsd: 9 }),
    run({ id: 3, branch: "z", startedAt: 1 * MIN, completedAt: 31 * MIN, costUsd: 9 }),
  ];
  const findings = analyzeAll(runs);
  assert.ok(findings.length >= 2);
  for (let i = 1; i < findings.length; i++) assert.ok(findings[i - 1].usd >= findings[i].usd, "sorted desc");
});

test("totalSpend sums all run costs", () => {
  assert.equal(totalSpend([run({ id: 1, costUsd: 3 }), run({ id: 2, costUsd: 4 })]), 7);
});

test("costOfJobs rounds each job up to the minute and prices by runner OS", () => {
  const jobs = [
    { started_at: "2026-06-01T00:00:00Z", completed_at: "2026-06-01T00:01:30Z", labels: ["ubuntu-latest"] }, // 1.5→2 min × 0.008
    { started_at: "2026-06-01T00:00:00Z", completed_at: "2026-06-01T00:00:30Z", labels: ["macos-14"] }, // 0.5→1 min × 0.08
  ];
  const usd = costOfJobs(jobs);
  assert.ok(Math.abs(usd - (2 * 0.008 + 1 * 0.08)) < 1e-9, `got ${usd}`);
});

test("costOfJobs ignores jobs with no timing (queued/skipped)", () => {
  const jobs = [{ started_at: null, completed_at: null, labels: ["ubuntu-latest"] }, { conclusion: "skipped", labels: [] }];
  assert.equal(costOfJobs(jobs), 0);
});

test("osFromLabels maps runner labels to a rate bucket", () => {
  assert.equal(osFromLabels(["ubuntu-latest"]), "UBUNTU");
  assert.equal(osFromLabels(["windows-2022"]), "WINDOWS");
  assert.equal(osFromLabels(["macos-14"]), "MACOS");
  assert.equal(osFromLabels([]), "UBUNTU");
});
