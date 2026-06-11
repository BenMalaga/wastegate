import { spawnSync } from "node:child_process";

// Thin wrapper over the `gh` CLI so wastegate rides the user's existing GitHub
// auth — no tokens to configure, nothing leaves the machine but the API reads gh
// already makes. Everything here is a read; wastegate never writes.

export function ghAvailable() {
  const r = spawnSync("gh", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

export function ghAuthed() {
  const r = spawnSync("gh", ["auth", "status"], { encoding: "utf8" });
  return r.status === 0;
}

export class GhError extends Error {}

// Call a GitHub REST endpoint via `gh api` and parse the JSON. Throws GhError on
// failure (with the API's message when available).
export function ghApi(path, { fields = [] } = {}) {
  const args = ["api", path, "-H", "Accept: application/vnd.github+json"];
  for (const f of fields) args.push(f);
  const r = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || "").trim().split("\n").filter(Boolean).pop() || "gh api failed";
    throw new GhError(msg);
  }
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new GhError(`could not parse gh api response for ${path}`);
  }
}

// Resolve the owner/repo for the current directory, or accept an explicit slug.
export function resolveRepo(explicit) {
  if (explicit) {
    if (!/^[^/]+\/[^/]+$/.test(explicit)) throw new GhError(`"${explicit}" is not an owner/repo slug.`);
    return explicit;
  }
  const r = spawnSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], { encoding: "utf8" });
  if (r.status !== 0) throw new GhError("not in a GitHub repo. Pass one explicitly, e.g. `wastegate owner/repo`.");
  return r.stdout.trim();
}
