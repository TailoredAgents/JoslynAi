#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const defaultRoots = [
  "apps/web/app/page.tsx",
  "apps/web/app/onboarding/page.tsx",
];
const roots = process.argv.slice(2);
const targets = roots.length ? roots : defaultRoots;

const textExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".md",
  ".mdx",
  ".json",
  ".css",
  ".scss",
]);

const ignoreDirs = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
]);

const problems = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoreDirs.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    await checkFile(fullPath);
  }
}

async function checkFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!textExtensions.has(ext)) {
    return;
  }
  const data = await readFile(filePath, "utf8");
  const badChars = [];
  for (let i = 0; i < data.length; i += 1) {
    const code = data.charCodeAt(i);
    if (code > 126 || (code < 32 && code !== 10 && code !== 9 && code !== 13)) {
      badChars.push({ index: i, code, snippet: data.slice(Math.max(0, i - 10), i + 10) });
    }
  }
  if (badChars.length) {
    problems.push({ file: filePath, chars: badChars });
  }
}

async function main() {
  for (const root of targets) {
    let stats;
    try {
      stats = await stat(root);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      await walk(root);
    } else {
      await checkFile(root);
    }
  }

  if (problems.length) {
    console.error("[ascii-check] Non-ASCII characters detected:");
    for (const problem of problems) {
      console.error(`- ${problem.file}`);
      for (const char of problem.chars) {
        const display = JSON.stringify(char.snippet);
        console.error(`  index ${char.index} code ${char.code} context ${display}`);
      }
    }
    process.exitCode = 1;
    return;
  }
}

main().catch((err) => {
  console.error("[ascii-check] Failed:", err);
  process.exitCode = 1;
});
