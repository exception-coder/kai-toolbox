import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, copyFile, symlink, open, unlink, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { npmCommand, run } from '../commands.mjs';
import { atomicJson, PREFIX, prepareRelease, publishRelease, readActive, removeOwned, verifyRelease } from './releases.mjs';

const execute = promisify(execFile);
export const frontendHome = paths => join(paths.home, 'frontend');

export async function gitText(root, args) {
  const { stdout } = await execute('git', args, { cwd: root, windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

export async function sourceIdentity(root, revision = 'HEAD') {
  const commit = await gitText(root, ['rev-parse', '--verify', revision]);
  if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('Invalid source revision');
  const tree = await gitText(root, ['rev-parse', `${commit}:frontend`]);
  const version = createHash('sha256').update(`forge-frontend-v1:${tree}`).digest('hex').slice(0, 24);
  return { revision: commit, tree, version };
}

async function acquireBuildLock(home) {
  const path = join(home, 'build.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(path, 'wx', 0o600);
      await file.writeFile(String(process.pid)); await file.close();
      return () => unlink(path);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(await readFile(path, 'utf8'));
      if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid frontend build lock; inspect runtime logs');
      try { process.kill(pid, 0); }
      catch (probe) {
        if (probe.code !== 'ESRCH') throw probe;
        await unlink(path); continue;
      }
      throw new Error('Another frontend build is already running');
    }
  }
  throw new Error('Cannot acquire frontend build lock');
}

async function dependencies(home, frontend, env) {
  const lock = await readFile(join(frontend, 'package-lock.json'));
  const hash = createHash('sha256').update(lock).digest('hex');
  const directory = join(home, 'dependencies', hash);
  await mkdir(directory, { recursive: true });
  let ready = false;
  try { ready = (await readFile(join(directory, '.ready'), 'utf8')) === hash; } catch { /* First install. */ }
  if (!ready) {
    for (const file of ['package.json', 'package-lock.json']) await copyFile(join(frontend, file), join(directory, file));
    await run(npmCommand(env), ['ci', '--no-audit', '--no-fund'], { cwd: directory, env });
    await writeFile(join(directory, '.ready'), hash);
  }
  await symlink(resolve(directory, 'node_modules'), join(frontend, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
}

export async function buildRelease(paths, env, { revision = 'HEAD', executeBuild } = {}) {
  const home = frontendHome(paths);
  await mkdir(home, { recursive: true });
  const unlock = await acquireBuildLock(home);
  let stage;
  try {
    const source = await sourceIdentity(paths.root, revision);
    const active = await readActive(home);
    if (active?.version === source.version) {
      await verifyRelease(join(home, 'releases', source.version));
      return active;
    }
    const persisted = join(home, 'releases', source.version);
    try {
      await stat(persisted);
      await verifyRelease(persisted);
      const metadata = { ...source, builtAt: new Date().toISOString() };
      await atomicJson(join(home, 'active.json'), metadata);
      return metadata;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    stage = join(home, 'candidates', randomUUID());
    await mkdir(stage, { recursive: true });
    const archive = join(stage, 'source.tar');
    await run({ file: 'git', args: [] }, ['archive', '--format=tar', `--output=${archive}`, source.revision, 'frontend'], { cwd: paths.root, env });
    await run({ file: 'tar', args: [] }, ['-xf', archive, '-C', stage], { cwd: paths.root, env });
    const frontend = join(stage, 'frontend');
    const output = join(stage, 'site');
    if (executeBuild) await executeBuild({ frontend, output, source });
    else {
      await dependencies(home, frontend, env);
      await run(npmCommand(env), ['run', 'build', '--', '--base', `${PREFIX}/releases/${source.version}/`, '--outDir', output], { cwd: frontend, env });
    }
    await prepareRelease(output, source.version);
    const metadata = { ...source, builtAt: new Date().toISOString() };
    await publishRelease(home, output, metadata);
    return metadata;
  } finally {
    try { if (stage) await removeOwned(home, stage); }
    finally { await unlock(); }
  }
}
