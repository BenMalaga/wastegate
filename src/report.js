import { fmtUsd } from "./pricing.js";

const isTTY = Boolean(process.stdout.isTTY);
const C = isTTY
  ? { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m" }
  : { reset: "", bold: "", dim: "", red: "", green: "", yellow: "", cyan: "" };

export function renderTerminal({ repo, days, totalSpend, findings, runCount }) {
  const out = [];
  out.push(`${C.bold}wastegate${C.reset} ${C.dim}· ${repo} · last ${days} days · ${runCount} completed runs${C.reset}`);
  const wasted = findings.reduce((a, f) => a + f.usd, 0);
  const pct = totalSpend > 0 ? Math.round((wasted / totalSpend) * 100) : 0;
  out.push(
    `${C.dim}Compute spend ${fmtUsd(totalSpend)} (at hosted-runner rates) · identified waste ${C.reset}${C.bold}${C.yellow}${fmtUsd(wasted)}${C.reset}${C.dim} (${pct}%)${C.reset}`,
  );
  out.push("");

  if (findings.length === 0) {
    out.push(`${C.green}No waste found in the analyzed window. Either you're tidy, or the window is quiet.${C.reset}`);
    return out.join("\n") + "\n";
  }

  for (const f of findings) {
    out.push(`${C.bold}${C.yellow}${fmtUsd(f.usd)}${C.reset}  ${C.bold}${f.title}${C.reset} ${C.dim}(${f.count})${C.reset}`);
    out.push(`  ${C.dim}${f.arithmetic}${C.reset}`);
    for (const o of f.offenders) {
      out.push(`  ${C.dim}·${C.reset} ${fmtUsd(o.usd).padStart(8)}  ${o.label} ${C.dim}— ${o.detail}${C.reset}`);
    }
    out.push(`  ${C.cyan}fix:${C.reset}`);
    for (const line of f.fix.split("\n")) out.push(`    ${C.dim}${line}${C.reset}`);
    out.push("");
  }
  out.push(`${C.dim}Every figure is billable-minutes × GitHub's per-minute rate, rounded per job as GitHub bills.${C.reset}`);
  out.push(`${C.dim}Read-only: wastegate changed nothing. Apply the fixes yourself.${C.reset}`);
  return out.join("\n") + "\n";
}

export function renderJson({ repo, days, totalSpend, findings, runCount }) {
  const wasted = findings.reduce((a, f) => a + f.usd, 0);
  return (
    JSON.stringify(
      {
        repo,
        windowDays: days,
        completedRuns: runCount,
        billableSpendUsd: round(totalSpend),
        identifiedWasteUsd: round(wasted),
        findings: findings.map((f) => ({
          key: f.key,
          title: f.title,
          wasteUsd: round(f.usd),
          count: f.count,
          arithmetic: f.arithmetic,
          topOffenders: f.offenders.map((o) => ({ label: o.label, detail: o.detail, usd: round(o.usd) })),
          fix: f.fix,
        })),
      },
      null,
      2,
    ) + "\n"
  );
}

export function renderMarkdown({ repo, days, totalSpend, findings, runCount }) {
  const wasted = findings.reduce((a, f) => a + f.usd, 0);
  const pct = totalSpend > 0 ? Math.round((wasted / totalSpend) * 100) : 0;
  const lines = [];
  lines.push(`## wastegate report — \`${repo}\``);
  lines.push("");
  lines.push(`Last ${days} days · ${runCount} completed runs · billable spend ${fmtUsd(totalSpend)} · **identified waste ${fmtUsd(wasted)} (${pct}%)**`);
  lines.push("");
  if (findings.length === 0) {
    lines.push("No waste found in the analyzed window.");
    return lines.join("\n") + "\n";
  }
  lines.push("| Waste | Cause | Count |");
  lines.push("| ---: | --- | ---: |");
  for (const f of findings) lines.push(`| ${fmtUsd(f.usd)} | ${f.title} | ${f.count} |`);
  lines.push("");
  for (const f of findings) {
    lines.push(`### ${fmtUsd(f.usd)} — ${f.title}`);
    lines.push("");
    lines.push(`_${f.arithmetic}_`);
    lines.push("");
    for (const o of f.offenders) lines.push(`- ${fmtUsd(o.usd)} — ${o.label} (${o.detail})`);
    lines.push("");
    lines.push("**Fix:**");
    lines.push("");
    lines.push("```yaml");
    lines.push(f.fix);
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

function round(n) {
  return Math.round(n * 100) / 100;
}
