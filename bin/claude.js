#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = join(__dirname, "../src/dev-entry.ts");

function findBunExecutable() {
  // macOS/Linux 直接通过 PATH 调用。
  if (process.platform !== "win32") {
    return "bun";
  }

  const candidates = [];

  // 当前包全局安装时，尝试解析同级全局 bun 包。
  try {
    const require = createRequire(import.meta.url);
    const bunPackageJson = require.resolve("bun/package.json");

    candidates.push(
      join(dirname(bunPackageJson), "bin", "bun.exe"),
    );
  } catch {
    // 本地项目中可能无法通过 Node 模块解析全局 bun。
  }

  // npm 全局目录与 node.exe 在同一目录的情况。
  candidates.push(
    join(
      dirname(process.execPath),
      "node_modules",
      "bun",
      "bin",
      "bun.exe",
    ),
  );

  // npm 默认 Windows 全局目录。
  if (process.env.APPDATA) {
    candidates.push(
      join(
        process.env.APPDATA,
        "npm",
        "node_modules",
        "bun",
        "bin",
        "bun.exe",
      ),
    );
  }

  // Bun 官方安装脚本目录。
  if (process.env.BUN_INSTALL) {
    candidates.push(
      join(process.env.BUN_INSTALL, "bin", "bun.exe"),
    );
  }

  // 检查 PATH 及 PATH 旁边的 npm 全局包目录。
  for (const pathDir of (process.env.PATH ?? "").split(";")) {
    if (!pathDir) continue;

    candidates.push(join(pathDir, "bun.exe"));
    candidates.push(
      join(pathDir, "node_modules", "bun", "bin", "bun.exe"),
    );
  }

  const bunExecutable = candidates.find(candidate =>
    existsSync(candidate),
  );

  if (!bunExecutable) {
    throw new Error(
      [
        "找不到 Bun 可执行文件。",
        "请先运行：npm install -g bun@1.3.5",
        "然后确认命令可以运行：bun --version",
      ].join("\n"),
    );
  }

  return bunExecutable;
}

let bunExecutable;

try {
  bunExecutable = findBunExecutable();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}

const result = spawnSync(
  bunExecutable,
  ["run", entry, ...process.argv.slice(2)],
  {
    stdio: "inherit",
    shell: false,
  },
);

if (result.error) {
  console.error(`启动 Bun 失败：${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);