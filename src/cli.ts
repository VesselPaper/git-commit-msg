#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline";
import { isGitRepo, getStagedDiff, getDiffForPR, getCurrentBranch } from "./git.ts";
import { analyzeDiff, formatCommitMessage, type CommitType } from "./analyze.ts";

const program = new Command();

function getTypeBadge(type: string): string {
  const colors: Record<string, (s: string) => string> = {
    feat: chalk.bgGreen.white,
    fix: chalk.bgRed.white,
    refactor: chalk.bgBlue.white,
    perf: chalk.bgMagenta.white,
    docs: chalk.bgCyan.black,
    style: chalk.bgWhite.black,
    test: chalk.bgYellow.black,
    build: chalk.bgGray.white,
    ci: chalk.bgGray.white,
    chore: chalk.bgGray.white,
    revert: chalk.bgRed.white,
    remove: chalk.bgRed.white,
  };
  const fn = colors[type] || chalk.bgGray.white;
  return fn(` ${type} `);
}

function commitWithMessage(message: string) {
  try {
    const msg = message.replace(/^[^\s]+\s/u, "");
    execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, {
      stdio: "inherit",
      encoding: "utf8",
    });
  } catch {
    console.error(chalk.red("\u2716 Commit failed"));
    process.exit(1);
  }
}

async function askYesNo(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer: string) => {
      rl.close();
      resolve(answer.trim().toLowerCase() !== "n");
    });
  });
}

program
  .name("gcmsg")
  .description("Smart git commit message generator \u2014 works out of the box")
  .version("0.1.0")
  .option("-e, --emoji", "add emoji prefix to commit message")
  .option("--pr", "generate PR description instead of commit message")
  .option("--base <branch>", "base branch for PR diff", "main")
  .option("-l, --lang <lang>", "output language: en | zh", "en")
  .option("--no-edit", "print message without prompting to commit")
  .option("--commit", "commit directly without prompting")
  .option("--diff", "show the diff being analyzed")
  .option("--style <style>", "commit style: conventional | simple", "conventional")
  .action(async (options) => {
    if (!isGitRepo()) {
      console.error(chalk.red("\u2716 Not a git repository"));
      process.exit(1);
    }

    let diffInfo;

    if (options.pr) {
      diffInfo = getDiffForPR(options.base);
      if (!diffInfo || diffInfo.files.length === 0) {
        console.error(chalk.yellow("! No diff found between current branch and " + options.base));
        process.exit(1);
      }
    } else {
      diffInfo = getStagedDiff();
      if (!diffInfo || diffInfo.files.length === 0) {
        console.error(chalk.yellow("! No staged changes found"));
        console.log(chalk.dim("  Run `git add <files>` to stage your changes first"));
        process.exit(1);
      }
    }

    if (options.diff) {
      console.log(chalk.dim("\u2500".repeat(50)));
      console.log(diffInfo.diffContent);
      console.log(chalk.dim("\u2500".repeat(50)));
    }

    const analysis = analyzeDiff(diffInfo);

    const message = formatCommitMessage(analysis, {
      emoji: options.emoji,
      pr: options.pr,
      lang: options.lang,
    });

    const statsColor = analysis.stats.additions > analysis.stats.deletions
      ? chalk.green : chalk.red;
    console.log(
      chalk.dim(analysis.stats.filesChanged + " files \u00B7 ") +
      statsColor("+" + analysis.stats.additions + " ") +
      chalk.red("-" + analysis.stats.deletions)
    );

    const badge = getTypeBadge(analysis.type);
    const scopeStr = analysis.scope ? chalk.dim("(" + analysis.scope + ")") : "";
    console.log(chalk.dim("Detected: ") + badge + scopeStr);

    console.log();
    console.log(chalk.bold("Generated message:"));
    console.log(chalk.cyan(message));
    console.log();

    if (options.pr || options.noEdit) {
      console.log(message);
      return;
    }

    if (options.commit) {
      commitWithMessage(message);
      return;
    }

    const yes = await askYesNo("Use this message to commit? (Y/n) ");
    if (yes) {
      commitWithMessage(message);
    } else {
      console.log(chalk.dim("Commit cancelled"));
    }
  });

program.parse(process.argv);
