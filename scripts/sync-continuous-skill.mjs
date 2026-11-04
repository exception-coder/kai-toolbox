import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

// Runtime resources own the instruction text; project discovery copies are generated.
const root = fileURLToPath(new URL('../', import.meta.url));
const name = 'forge-openspec-continuous-execution';
const source = resolve(root, 'tools/tool-claude-chat/src/main/resources/skills', name);
const files = ['SKILL.md', 'references/writer-recovery.md', 'references/database-verification.md'];
const check = process.argv.includes('--check');
let drift = false;
const pending = [];
for (const engine of ['.agents', '.claude']) {
  for (const file of files) {
    const content = readFileSync(resolve(source, file));
    const target = resolve(root, engine, 'skills', name, file);
    let current;
    try { current = readFileSync(target); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (current?.equals(content)) continue;
    if (current && !current.toString('utf8').includes('x-forge-owned: true')) {
      console.error(`Preserving user-owned skill asset: ${target}`);
      drift = true;
      continue;
    }
    if (check) {
      console.error(`Skill copy differs: ${engine}/skills/${name}/${file}`);
      drift = true;
    } else {
      pending.push({ target, content, entry: file === 'SKILL.md' });
    }
  }
}
if (!check && !drift) {
  for (const { target, content } of pending.sort((a, b) => Number(a.entry) - Number(b.entry))) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}
if (drift) process.exitCode = 1;
