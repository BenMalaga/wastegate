# Contributing to wastegate

Thanks for helping. wastegate is small, zero-dependency, and **read-only by
design** — it must never gain a code path that writes to a repo or sends data
anywhere. Keep it that way.

## Development

```bash
git clone https://github.com/BenMalaga/wastegate
cd wastegate
node --test                 # unit tests — pure analysis, no network
node bin/wastegate.js --help
node bin/wastegate.js facebook/react --days 7   # run against any public repo
```

No build step, no dependencies. ES modules, Node ≥ 18. Auth and all API reads go
through the user's `gh` CLI.

### Layout

| File | Responsibility |
| --- | --- |
| `src/analyze.js` | The waste analyses. **Pure functions** — this is where new causes go, and where they're unit-tested without a network. |
| `src/pricing.js` | The runner rate card and per-job cost math. |
| `src/fetch.js` | Pull runs + timings via `gh`, with an on-disk cache. |
| `src/gh.js` | The `gh` wrapper. The only module that shells out. |
| `src/report.js` | Terminal / JSON / Markdown rendering. |
| `src/cli.js` | Argument parsing and orchestration. |

The rule that keeps the project honest: **every dollar figure must carry its
arithmetic** (`finding.arithmetic`). If you add an analysis, add the formula a
skeptic can check, and a unit test with synthetic runs.

## Most-wanted analyses

The four shipped causes are the start. These are verified to exist in **no other
tool** and are the highest-value additions:

1. **Matrix redundancy** — matrix entries that never caught a unique failure over
   the window (needs the jobs endpoint and cross-run analysis). The hardest and
   most-wanted.
2. **Draft-PR run waste** — runs triggered while a PR was a draft, reconstructed
   from the PR timeline.
3. **Org-wide rollup** — sweep every repo in an org and rank them.
4. **Packaging as a true `gh` extension** (`gh extension install`).

Open an issue to claim one. MIT licensed; contributions ship under the same
license.
