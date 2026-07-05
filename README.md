<div align="center">

# wastegate

### Dollar-denominated waste forensics for GitHub Actions.

Not "what does CI cost." **Which specific waste, in dollars, and the one-line
YAML change that stops it.** Local, read-only, uses the `gh` auth you already
have. Nothing leaves your machine.

[![npm](https://img.shields.io/npm/v/wastegate?color=cb3837&label=npm)](https://www.npmjs.com/package/wastegate)
[![CI](https://github.com/BenMalaga/wastegate/actions/workflows/test.yml/badge.svg)](https://github.com/BenMalaga/wastegate/actions)
![node](https://img.shields.io/badge/node-%E2%89%A518-339933)
![deps](https://img.shields.io/badge/dependencies-0-success)
![mode](https://img.shields.io/badge/mode-read--only-blue)
![license](https://img.shields.io/badge/license-MIT-yellow)

</div>

---

Every CI cost dashboard answers "where do the minutes go?" None of them answer
the question your team actually has: **which minutes were waste, what caused it,
and what's the fix?** wastegate replays your repo's Actions run history through
counterfactual analyses (*what would a `concurrency` block have cancelled? what
did failed runs burn? what did re-runs of flaky jobs cost?*) and prints a ledger
where every line item is a cause, a dollar figure **with its arithmetic shown**,
and a copy-pasteable fix.

```bash
npx wastegate                      # audit the repo you're in
npx wastegate vitejs/vite --days 1 # audit any public repo, right now
```

Real output (vitejs/vite, one day of history):

```
wastegate · vitejs/vite · last 1 days · 128 completed runs
Compute spend $9.34 (at hosted-runner rates) · identified waste $8.07 (86%)

$7.45  Spend on failed runs (16)
  16 failed runs x their billable minutes
  -    $0.73  CI on fix/deep-import-error-message - failed after 6 min
  -    $0.72  CI on renovate/pnpm-11.x - failed after 6 min
  fix:
    Order jobs cheapest-first and fail fast: run lint/typecheck/unit before slow
    integration/e2e jobs, add `timeout-minutes:` to long jobs...

$0.61  Spend on re-run (flaky) attempts (2)
  2 runs with >1 attempt, charging (attempt-1)/attempt of cost as waste
  -    $0.33  CI on feat/hmr-add-runtimeErrors-option - re-run 2x before passing
  fix:
    Re-runs are flaky tests with a dollar sign. Quarantine the flakers...

$0.02  Runs a concurrency block would have cancelled (2)
  2 runs that overlapped a newer run on the same workflow+branch
  fix:
    concurrency:
      group: ${{ github.workflow }}-${{ github.ref }}
      cancel-in-progress: true

Every figure is billable-minutes × GitHub's per-minute rate, rounded per job as GitHub bills.
Read-only: wastegate changed nothing. Apply the fixes yourself.
```

## Install

```bash
npx wastegate              # nothing to install
# or
npm install -g wastegate
```

Requires the [GitHub CLI](https://cli.github.com) (`gh auth login`) and Node ≥ 18.
Zero npm dependencies.

## Usage

```bash
wastegate                            # current repo, last 30 days
wastegate owner/repo --days 14       # any repo your gh token can read
wastegate --md  > waste-report.md    # paste into an issue/PR for your team
wastegate --json                     # pipe into your own tooling
wastegate --rate-ubuntu 0            # self-hosted runners? price them at $0
```

| Flag | |
| --- | --- |
| `owner/repo` | Repo to audit. Default: the repo you're standing in. |
| `-d, --days <n>` | History window. Default: 30. |
| `--json` / `--md` | Machine-readable / markdown output. |
| `--rate-ubuntu/-windows/-macos <usd>` | Per-minute rates. Defaults: GitHub's standard-runner prices (0.008 / 0.016 / 0.08). |

## The analyses

| Cause | What it computes |
| --- | --- |
| **Superseded runs** | Runs that kept burning minutes after a newer push made them irrelevant, i.e., exactly what `concurrency.cancel-in-progress` would have cancelled, computed *counterfactually from your real run timestamps*. Static linters can tell you the block is missing; wastegate tells you what its absence **cost last month**. |
| **Failed-run spend** | Every minute of a failed run produced nothing. Ranked by cost, surfacing the runs that died late after long builds: the classic "e2e fails in minute 22 because lint would have failed in minute 1" pattern. |
| **Re-run (flake) spend** | Runs with `attempt > 1`: someone clicked re-run because something flaked. Earlier attempts are charged as waste, conservatively. |

Costs are computed from **per-job wall-clock durations × GitHub's per-minute
runner rates, rounded up per job exactly as GitHub bills**, which also means it
works on public repos (where GitHub's own `billable` field is always $0) and
answers "what *would* this cost on metered minutes."

**Honesty rules:** every finding prints its arithmetic; estimates say
"estimate"; the tool is structurally read-only (it shells out to `gh api` GETs
and nothing else).

## Why not ___?

- **Hosted CI-cost dashboards** (Kleore, CostOps, Mergify, etc.): require sending your
  data to a third party, and stop at *where* the money goes. wastegate is local
  and answers *why*, with the fix.
- **Local usage CLIs** (`actions-usage`, `gh-workflow-stats`, etc.): minutes and
  durations, no dollars, no causes, no counterfactuals.
- **Static workflow linters** (`ci-doctor`-style): they predict ("you're missing
  a concurrency block"); wastegate **measures** ("its absence cost $412 in the
  last 30 days, here are the runs").

The counterfactual analyses (superseded-run cost, and the planned
matrix-redundancy and draft-PR analyses) exist in no other tool, hosted or
local, as of mid-2026.

## Roadmap

Matrix entries that never caught a unique failure · draft-PR run waste ·
org-wide rollup · `gh extension install`. The analyses are pure functions over
run records. See [CONTRIBUTING.md](CONTRIBUTING.md) if you want to add one.

## License

[MIT](LICENSE)
