import { execSync } from "node:child_process";
import type { DiffInfo, FileStat } from "./git.ts";

export type CommitType =
  | "feat" | "fix" | "refactor" | "perf" | "docs"
  | "style" | "test" | "build" | "ci" | "chore" | "revert" | "remove";

export interface ChangeAnalysis {
  type: CommitType;
  scope: string;
  subject: string;
  body: string[];
  isBreaking: boolean;
  files: FileStat[];
  stats: { additions: number; deletions: number; filesChanged: number; };
}

const TYPE_KEYWORDS: [CommitType, string[]][] = [
  ["feat",    ["add", "new", "feature", "implement", "introduce", "support", "create"]],
  ["fix",     ["fix", "bug", "hotfix", "patch", "error", "crash", "broken", "incorrect"]],
  ["refactor", ["refactor", "rename", "move", "extract", "restructure", "simplify", "clean"]],
  ["perf",    ["perf", "performance", "optimize", "speed", "fast", "slow", "memory"]],
  ["docs",    ["doc", "readme", "comment", "documentation"]],
  ["style",   ["format", "lint", "prettier", "indent", "whitespace"]],
  ["test",    ["test", "spec", "assert", "jest", "vitest", "coverage"]],
  ["build",   ["build", "webpack", "vite", "tsup", "bundle", "package"]],
  ["ci",      ["ci", "github action", "workflow", "pipeline", "deploy"]],
  ["chore",   ["chore", "bump", "version", "config", "ignore"]],
  ["revert",  ["revert", "rollback", "undo"]],
  ["remove",  ["remove", "delete", "deprecate", "drop"]],
];

const TEST_RE = /\.test\.|\.spec\.|__tests__\/|test\//;
const DOC_RE = /\.md$|\.mdx$|docs\/|wiki\//;
const CONFIG_RE = /\.json$|\.yaml$|\.yml$|\.toml$|Dockerfile|tsconfig|eslint|prettier|vite\.config/;

export function analyzeDiff(info: DiffInfo): ChangeAnalysis {
  const d = info.diffContent.toLowerCase();
  const scores: Record<string, number> = {};
  for (const [t] of TYPE_KEYWORDS) scores[t] = 0;

  for (const f of info.fileStats) {
    if (f.status === "add") scores.feat += 3;
    if (f.status === "delete") { scores.remove += 3; scores.refactor += 1; }
    if (TEST_RE.test(f.path)) scores.test += 3;
    if (DOC_RE.test(f.path)) scores.docs += 3;
    if (CONFIG_RE.test(f.path)) scores.build += 2;
  }

  for (const [type, kws] of TYPE_KEYWORDS) {
    for (const kw of kws) {
      const re = new RegExp(kw, "gi");
      const m = d.match(re);
      if (m) scores[type] += m.length;
    }
  }

  let best: CommitType = "chore";
  let bestScore = 0;
  for (const [t] of TYPE_KEYWORDS) {
    if (scores[t] > bestScore) { bestScore = scores[t]; best = t as CommitType; }
  }

  const scope = detectScope(info.fileStats);
  const isBreaking = /^BREAKING CHANGE:/m.test(info.diffContent);
  const subject = genSubject(best, info.fileStats, info.diffContent);
  const body = genBody(info.fileStats);

  return {
    type: best, scope, subject, body, isBreaking,
    files: info.fileStats,
    stats: { additions: info.additions, deletions: info.deletions, filesChanged: info.fileStats.length },
  };
}

function detectScope(files: FileStat[]): string {
  if (files.length === 0) return "";
  const parts = files.map(f => f.path.split(/[/\\]/));
  if (parts[0].length <= 1) return "";
  const rootDirs = new Set(["src", "lib", "app", "packages", "dist"]);
  const top = parts[0][0];
  if (!rootDirs.has(top) && parts.every(p => p[0] === top)) return top;
  if (rootDirs.has(top) && parts[0].length > 2) {
    const second = parts[0][1];
    if (second && parts.every(p => p.length > 1 && p[1] === second)) return second;
  }
  return top;
}

function actionOf(type: CommitType): string {
  const map: Record<string, string> = {
    feat: "add", fix: "fix", refactor: "refactor", perf: "optimize",
    docs: "update", style: "format", test: "add", build: "update",
    ci: "update", chore: "update", revert: "revert", remove: "remove"
  };
  return map[type] || "update";
}

function genSubject(type: CommitType, files: FileStat[], diff: string): string {
  const action = actionOf(type);
  if (files.length === 0) return "make changes";

  if (files.length === 1) {
    const f = files[0];
    const name = f.path.split(/[/\\]/).pop() || f.path;
    if (f.status === "delete") return "remove " + name;
    if (f.status === "add") return "add " + name;
    const syms = extractSymbols(diff);
    if (syms.length > 0) return action + " " + syms[0];
    const base = name.replace(/\.[^.]+$/, "").replace(/[-_.]/g, " ");
    return action + " " + base;
  }

  const syms = extractSymbols(diff);
  if (syms.length > 0) {
    if (files.length <= 3) return action + " " + syms.slice(0, 2).join(", ");
    return action + " " + syms[0] + " and " + (files.length - 1) + " more";
  }
  return action + " " + files.length + " files";
}

function extractSymbols(diff: string): string[] {
  const syms: string[] = [];
  const re = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[:=]|^(?:export\s+)?class\s+(\w+)|^(?:export\s+)?interface\s+(\w+)/gm;
  for (const line of diff.split("\n").filter(l => l.startsWith("+") && !l.startsWith("+++"))) {
    const m = re.exec(line);
    if (m) {
      const name = m[1] || m[2] || m[3] || m[4];
      if (name && !syms.includes(name)) syms.push(name);
    }
  }
  return syms.slice(0, 5);
}

function genBody(files: FileStat[]): string[] {
  const body: string[] = [];
  for (const f of files) {
    const icon = f.status === "add" ? "+" : f.status === "delete" ? "-" : "~";
    let detail = "";
    if (f.additions > 0 || f.deletions > 0) {
      detail = " (" + (f.additions > 0 ? "+" + f.additions : "") + (f.deletions > 0 ? " -" + f.deletions : "") + ")";
    }
    body.push("  " + icon + " " + f.path + detail);
  }
  return body;
}

export function formatCommitMessage(analysis: ChangeAnalysis, opts: {
  emoji?: boolean; pr?: boolean; lang?: "en" | "zh";
}): string {
  if (opts.pr) {
    return formatPR(analysis, opts.lang);
  }

  const emojiMap: Record<string, string> = {
    feat: "\u2728", fix: "\u{1F41B}", refactor: "\u267B\uFE0F",
    perf: "\u26A1", docs: "\u{1F4DD}", style: "\u{1F484}",
    test: "\u2705", build: "\u{1F4E6}", ci: "\u{1F477}",
    chore: "\u{1F527}", revert: "\u23EA", remove: "\u{1F525}",
  };

  const prefix = opts.emoji ? (emojiMap[analysis.type] || "") + " " : "";
  const scope = analysis.scope ? "(" + analysis.scope + ")" : "";
  const breakM = analysis.isBreaking ? "!" : "";
  const header = prefix + analysis.type + scope + breakM + ": " + analysis.subject;
  const body = analysis.body.length > 0 ? "\n" + analysis.body.join("\n") : "";
  const brk = analysis.isBreaking ? "\n\nBREAKING CHANGE: " + analysis.subject : "";
  return header + body + brk;
}

function formatPR(analysis: ChangeAnalysis, lang?: string): string {
  const en = lang !== "zh";
  const title = analysis.type + (analysis.scope ? "(" + analysis.scope + ")" : "") + ": " + analysis.subject;
  const s = en
    ? "## Summary\n\n" + analysis.stats.filesChanged + " files changed, +" + analysis.stats.additions + "/-" + analysis.stats.deletions + " lines\n\n## Changes"
    : "## \u6982\u8FF0\n\n" + analysis.stats.filesChanged + " \u4E2A\u6587\u4EF6\u53D8\u66F4\uFF0C+" + analysis.stats.additions + "/-" + analysis.stats.deletions + " \u884C\n\n## \u53D8\u66F4\u5185\u5BB9";
  const files = analysis.body.join("\n");
  const check = en
    ? "\n\n## Checklist\n\n- [ ] Tests pass\n- [ ] Docs updated (if needed)"
    : "\n\n## \u68C0\u67E5\u6E05\u5355\n\n- [ ] \u6D4B\u8BD5\u901A\u8FC7\n- [ ] \u6587\u6863\u5DF2\u66F4\u65B0\uFF08\u5982\u6709\u9700\u8981\uFF09";
  return title + "\n\n" + s + "\n\n" + files + check;
}
