#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = join(__dirname, "../src/dev-entry.ts");

const result = spawnSync("bun", ["run", entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);