import { execSync } from "node:child_process";

export interface DiffInfo {
  files: string[];
  additions: number;
  deletions: number;
  fileStats: FileStat[];
  diffContent: string;
}

export interface FileStat {
  path: string;
  additions: number;
  deletions: number;
  status: "add" | "modify" | "delete" | "rename";
}

function runGit(args: string): string {
  try {
    return execSync(`git ${args}`, {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 10000,
    });
  } catch {
    return "";
  }
}

export function isGitRepo(): boolean {
  const result = runGit("rev-parse --is-inside-work-tree");
  return result.trim() === "true";
}

export function getStagedDiff(): DiffInfo | null {
  const statOutput = runGit("diff --cached --stat");
  if (!statOutput.trim()) return null;

  const diffContent = runGit("diff --cached");
  const statLines = statOutput.trim().split("\n");

  const files: string[] = [];
  const fileStats: FileStat[] = [];
  let totalAdd = 0;
  let totalDel = 0;

  for (const line of statLines) {
    const fileMatch = line.match(/^(.+?)\s+\|/);
    if (!fileMatch) continue;

    const path = fileMatch[1].trim();
    files.push(path);

    const changes = line.replace(/^.+?\|\s*\d+\s+/, "");
    const adds = (changes.match(/\+/g) || []).length;
    const dels = (changes.match(/-/g) || []).length;

    let status: FileStat["status"] = "modify";
    const fileSectionStart = diffContent.indexOf(`diff --git a/${path}`);
    const fileSectionEnd = diffContent.indexOf("diff --git", fileSectionStart + 10);
    const fileSection = fileSectionStart >= 0
      ? diffContent.slice(fileSectionStart, fileSectionEnd > fileSectionStart ? fileSectionEnd : undefined)
      : "";
    if (fileSection.includes("new file mode")) {
      status = "add";
    } else if (fileSection.includes("deleted file mode")) {
      status = "delete";
    }

    fileStats.push({ path, additions: adds, deletions: dels, status });
    totalAdd += adds;
    totalDel += dels;
  }

  return { files, additions: totalAdd, deletions: totalDel, fileStats, diffContent };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\$&");
}

export function getDiffForPR(baseBranch = "main"): DiffInfo | null {
  const statOutput = runGit(`diff ${baseBranch}...HEAD --stat`);
  if (!statOutput.trim()) return null;

  const diffContent = runGit(`diff ${baseBranch}...HEAD`);
  const statLines = statOutput.trim().split("\n");

  const files: string[] = [];
  const fileStats: FileStat[] = [];
  let totalAdd = 0;
  let totalDel = 0;

  for (const line of statLines) {
    const fileMatch = line.match(/^(.+?)\s+\|/);
    if (!fileMatch) continue;

    const path = fileMatch[1].trim();
    files.push(path);

    const changes = line.replace(/^.+?\|\s*\d+\s+/, "");
    const adds = (changes.match(/\+/g) || []).length;
    const dels = (changes.match(/-/g) || []).length;

    fileStats.push({ path, additions: adds, deletions: dels, status: "modify" });
    totalAdd += adds;
    totalDel += dels;
  }

  return { files, additions: totalAdd, deletions: totalDel, fileStats, diffContent };
}

export function getCurrentBranch(): string {
  return runGit("rev-parse --abbrev-ref HEAD").trim();
}
