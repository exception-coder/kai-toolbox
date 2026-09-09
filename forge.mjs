#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { npmCommand, run } from './scripts/runtime/commands.mjs';
import { readConfig } from './scripts/runtime/config.mjs';

const root = dirname(fileURLToPath(import.meta.url));
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Forge requires Node.js 22 or later');
  const command = process.argv[2] || 'help';
  if (!['help', '--help', '-h'].includes(command) && !existsSync(join(root, 'scripts/runtime/node_modules/pm2/package.json'))) {
    console.log('Installing locked Forge runtime dependencies...');
    const env = readConfig(root);
    await run(npmCommand(env), ['ci', '--no-audit', '--no-fund'], { cwd: join(root, 'scripts/runtime'), env });
  }
  const { main } = await import('./scripts/runtime/cli.mjs');
  await main(root, process.argv.slice(2));
} catch (error) {
  console.error(`[forge] ${error.message}`);
  process.exitCode = 1;
}
