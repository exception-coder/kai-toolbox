import { mkdir, readFile, writeFile, rename, stat, readdir, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { brotliCompress, constants } from 'node:zlib';
import { promisify } from 'node:util';

export const PREFIX = '/__forge_frontend';
const compress = promisify(brotliCompress);
export const validVersion = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);

export async function readActive(home) {
  try {
    const active = JSON.parse(await readFile(join(home, 'active.json'), 'utf8'));
    if (!validVersion(active.version)) return null;
    await stat(join(home, 'releases', active.version, 'index.html'));
    return active;
  } catch { return null; }
}

export async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await rename(temporary, file);
}

/** Only owned candidate/build folders underneath this runtime may be removed. */
export async function removeOwned(home, target) {
  const base = resolve(home), path = resolve(target);
  if (!path.startsWith(base + sep) || path === base) throw new Error('Unsafe frontend cleanup path');
  await rm(path, { recursive: true, force: true });
}

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Release contains a symbolic link');
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function prepareRelease(directory, version) {
  const indexPath = join(directory, 'index.html');
  let html = await readFile(indexPath, 'utf8');
  const sources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match => match[1]);
  if (sources.some(source => {
    const path = new URL(source, 'http://forge.local').pathname;
    return path === '/@vite/client' || path.startsWith('/src/');
  })) throw new Error('Development HTML cannot be published');
  const assets = sources.filter(source => source.startsWith(`${PREFIX}/releases/${version}/`));
  if (!assets.length) throw new Error('Production entry script is missing');
  for (const source of assets) {
    const path = source.slice(`${PREFIX}/releases/${version}/`.length).split('?')[0];
    if (path.split('/').includes('..') || !path.startsWith('assets/')) throw new Error('Invalid entry asset');
    await stat(join(directory, path));
  }
  html = html.replace('</head>', `<meta name="forge-frontend-version" content="${version}"></head>`);
  await writeFile(indexPath, html);
  const files = await filesBelow(directory);
  for (const file of files) {
    if (/\.(?:js|css|html|svg|json|txt)$/.test(file)) {
      const bytes = await readFile(file);
      if (bytes.length > 1024) await writeFile(file + '.br', await compress(bytes, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
      }));
    }
  }
  const manifest = {};
  for (const file of await filesBelow(directory)) {
    const path = file.slice(directory.length + 1).split(sep).join('/');
    manifest[path] = createHash('sha256').update(await readFile(file)).digest('hex');
  }
  await writeFile(join(directory, '.release.json'), JSON.stringify(manifest));
}

/** Validate a persisted release before trusting its pointer after process restart. */
export async function verifyRelease(directory) {
  const manifest = JSON.parse(await readFile(join(directory, '.release.json'), 'utf8'));
  if (!manifest['index.html']) throw new Error('Release manifest has no HTML');
  for (const [path, hash] of Object.entries(manifest)) {
    if (path.startsWith('/') || path.includes('..') || path.includes('\\')) throw new Error('Invalid release manifest');
    const actual = createHash('sha256').update(await readFile(join(directory, path))).digest('hex');
    if (actual !== hash) throw new Error('Release integrity check failed');
  }
}

export async function publishRelease(home, candidate, metadata) {
  if (!validVersion(metadata.version)) throw new Error('Invalid release version');
  await verifyRelease(candidate);
  const destination = join(home, 'releases', metadata.version);
  await mkdir(join(home, 'releases'), { recursive: true });
  await rename(candidate, destination);
  await atomicJson(join(home, 'active.json'), metadata);
}

/** Keep every release for seven days and at least the latest three, including active. */
export async function pruneReleases(home, activeVersion, now = Date.now()) {
  const directory = join(home, 'releases');
  const releases = [];
  for (const name of await readdir(directory)) {
    if (!validVersion(name)) continue;
    releases.push({ name, time: (await stat(join(directory, name))).mtimeMs });
  }
  releases.sort((a, b) => b.time - a.time);
  for (const release of releases.slice(3)) {
    if (release.name !== activeVersion && now - release.time > 7 * 86400_000) {
      await removeOwned(home, join(directory, release.name));
    }
  }
}
