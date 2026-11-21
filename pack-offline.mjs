import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROJECT_DIR = fileURLToPath(new URL('./', import.meta.url));
const PACKAGE_PATH = new URL('./package.json', import.meta.url);
const BACKUP_DIR = fileURLToPath(new URL('./backups/', import.meta.url));
const NPM_CLI_PATH = process.env.npm_execpath;

if (!NPM_CLI_PATH) {
  throw new Error('请通过 npm run pack:offline 执行此脚本。');
}

const originalPackage = readFileSync(PACKAGE_PATH, 'utf8');
const packageJson = JSON.parse(originalPackage);
mkdirSync(BACKUP_DIR, { recursive: true });

// 仅离线备份时启用依赖打包，结束后恢复原文件，避免影响后续发布。
try {
  packageJson.bundleDependencies = true;
  writeFileSync(PACKAGE_PATH, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

  const result = spawnSync(
    process.execPath,
    [NPM_CLI_PATH, 'pack', '--pack-destination', BACKUP_DIR],
    { cwd: PROJECT_DIR, stdio: 'inherit' },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`离线备份打包失败，退出码：${result.status}`);
  }
} finally {
  writeFileSync(PACKAGE_PATH, originalPackage, 'utf8');
}
