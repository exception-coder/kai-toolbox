import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const moduleRoot = join(root, 'go/environment-probe');
const suffix = process.platform === 'win32' ? '.exe' : '';
const cachedGo = join(process.env.LOCALAPPDATA || homedir(), 'kai-toolbox/toolchains/go/bin', `go${suffix}`);
const go = process.env.GO_CMD || (existsSync(cachedGo) ? cachedGo : `go${suffix}`);
const output = join(moduleRoot, 'bin', `environment-probe${suffix}`);
mkdirSync(dirname(output), { recursive: true });
for (const args of [['test', './...'], ['vet', './...'], ['build', '-trimpath', '-o', output, './cmd/environment-probe']]) {
  const result = spawnSync(go, args, { cwd: moduleRoot, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message || `Go ${args[0]} failed`);
    process.exit(1);
  }
}
const installed = join(homedir(), '.kai-toolbox/bin', `environment-probe${suffix}`);
mkdirSync(dirname(installed), { recursive: true });
try {
  copyFileSync(output, installed);
} catch (error) {
  if (error.code === 'EBUSY' || error.code === 'EPERM') {
    console.error('Go 检测器正在使用或目标目录不可写；保留已有制品，待检测结束后重试构建。');
    process.exit(1);
  }
  throw error;
}
console.log(`Go environment probe installed: ${installed}`);
