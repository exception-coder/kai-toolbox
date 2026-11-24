// Node.js 22+. Uses the production SDK; reports contain private case material.
import { ForgeConsultBackendClient } from '../dist/backend.js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const pending = new Set(['QUEUED', 'RUNNING', 'CANCEL_REQUESTED']);
const hash = value => createHash('sha256').update(value).digest('hex');

async function save(path, value) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
}

async function load(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Checks transport/result consistency. Human correctness remains a separate review. */
export function checkReplayResult(task, images) {
  const issues = [];
  if (!['SUCCEEDED', 'NEEDS_INFORMATION'].includes(task.status)) return issues;
  const result = task.result;
  if (!result || result.schemaVersion !== '1.2' || !Object.hasOwn(result, 'businessResult')
    || (result.businessResult !== null && (typeof result.businessResult !== 'object' || Array.isArray(result.businessResult)))) {
    issues.push('INVALID_FLEX_RESULT');
    return issues;
  }
  if (!Array.isArray(result.missingInformation)
    || (result.missingInformation.length === 0) !== (task.status === 'SUCCEEDED')) issues.push('STATUS_INFORMATION_MISMATCH');
  if (!result.humanHandoff || typeof result.humanHandoff.recommended !== 'boolean'
    || typeof result.humanHandoff.reason !== 'string' || !result.humanHandoff.reason.trim()) issues.push('INVALID_HANDOFF');
  const candidates = result.replyCandidates;
  if (!Array.isArray(result.evidence) || result.evidence.some(item => !item || typeof item.id !== 'string')) {
    issues.push('INVALID_EVIDENCE');
    return issues;
  }
  const evidence = new Set(result.evidence.map(item => item.id));
  if (!Array.isArray(candidates) || candidates.length > 8) issues.push('INVALID_CANDIDATES');
  else {
    if (candidates.length === 0 && result.humanHandoff?.recommended !== true) issues.push('EMPTY_WITHOUT_HANDOFF');
    const texts = new Set();
    for (const [index, candidate] of candidates.entries()) {
      if (!candidate || typeof candidate.text !== 'string') {
        issues.push('INVALID_CANDIDATE');
        continue;
      }
      if (candidate.id !== `reply-${index + 1}` || !candidate.text.trim()
        || candidate.text.length > 4000 || texts.has(candidate.text.trim()) || !Array.isArray(candidate.evidenceIds)
        || candidate.evidenceIds.length === 0 || candidate.evidenceIds.some(id => !evidence.has(id))) issues.push('INVALID_CANDIDATE');
      texts.add(candidate.text.trim());
    }
  }
  if (images.length > 0) {
    const actual = result.imageInputs;
    const observations = result.imageObservations;
    if (!Array.isArray(actual) || !Array.isArray(observations) || actual.length !== images.length || observations.length !== images.length) {
      issues.push('IMAGE_MAPPING_MISMATCH');
    } else {
      const ids = observations.map(item => item?.attachmentId);
      for (const image of images) {
        const received = actual.filter(item => item?.attachmentId === image.attachmentId);
        const seen = observations.filter(item => item?.attachmentId === image.attachmentId);
        if (received.length !== 1 || received[0].sha256 !== image.sha256 || received[0].mediaType !== image.mediaType
          || (image.size !== undefined && received[0].size !== image.size) || seen.length !== 1 || seen[0].readable !== true
          || typeof seen[0].observation !== 'string' || !seen[0].observation.trim()) issues.push('IMAGE_MAPPING_MISMATCH');
      }
      if (new Set(ids).size !== ids.length) issues.push('IMAGE_MAPPING_MISMATCH');
    }
  }
  return [...new Set(issues)];
}

/** A single output directory owns one immutable case, identity and asynchronous request. */
export async function replayCase({ client, baseUrl, clientId, casePath, outputDirectory, waitMs = 240000, pollMs = 2500 }) {
  if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 3600000 || !Number.isInteger(pollMs) || pollMs < 1) {
    throw new Error('INVALID_REPLAY_TIMEOUT');
  }
  const spec = JSON.parse(await readFile(casePath, 'utf8'));
  if (!spec.input || spec.input.replyMode !== 'FORGE_FLEX' || !/^[A-Za-z0-9_-]{8,100}$/.test(spec.input.requestId)) {
    throw new Error('INVALID_REPLAY_INPUT');
  }
  const imageSpecs = spec.images ?? [];
  if (!Array.isArray(imageSpecs) || imageSpecs.length > 5
    || (imageSpecs.length > 0 && (spec.input.attachmentIds?.length || spec.input.imageRefs?.length))) throw new Error('INVALID_REPLAY_IMAGES');
  const originals = [];
  for (const image of imageSpecs) {
    if (!['image/png', 'image/jpeg'].includes(image.mediaType) || !/^[A-Za-z0-9_-]{8,100}$/.test(image.uploadId)) throw new Error('INVALID_REPLAY_IMAGES');
    const bytes = await readFile(resolve(dirname(casePath), image.path));
    if (bytes.length < 1 || bytes.length > 5 * 1024 * 1024) throw new Error('INVALID_REPLAY_IMAGES');
    originals.push({ ...image, bytes, sha256: hash(bytes) });
  }
  if (originals.reduce((size, image) => size + image.bytes.length, 0) > 20 * 1024 * 1024) throw new Error('INVALID_REPLAY_IMAGES');
  const fingerprint = hash(JSON.stringify({ input: spec.input,
    images: imageSpecs.map(image => ({ uploadId: image.uploadId, mediaType: image.mediaType })),
    digests: originals.map(image => image.sha256) }));
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const lockPath = resolve(outputDirectory, 'replay.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    const statePath = resolve(outputDirectory, 'checkpoint.json');
    let state = await load(statePath);
    if (state && (state.version !== 1 || state.fingerprint !== fingerprint || state.baseUrl !== baseUrl || state.clientId !== clientId)) throw new Error('REPLAY_INPUT_CHANGED');
    if (!state) {
      state = { version: 1, baseUrl, clientId, fingerprint, sourceInput: spec.input, uploads: [], input: null, attempted: false, task: null };
      await save(statePath, state);
    }
    if (!state.input) {
      for (let index = state.uploads.length; index < originals.length; index++) {
        const original = originals[index];
        const image = await client.uploadOrReuseImage(original.uploadId, original.bytes, original.mediaType);
        if (image.sha256 !== original.sha256 || image.mediaType !== original.mediaType || image.size !== original.bytes.length) {
          throw new Error('REPLAY_IMAGE_MISMATCH');
        }
        state.uploads.push(image);
        await save(statePath, state);
      }
      state.input = structuredClone(spec.input);
      if (state.uploads.length > 0) state.input.attachmentIds = state.uploads.map(image => image.attachmentId);
      await save(statePath, state);
    }
    if (!state.images) {
      state.images = state.uploads.length > 0 ? state.uploads
        : await Promise.all((state.input.attachmentIds ?? []).map(id => client.getImage(id)));
      if (state.input.imageRefs?.length) {
        state.images = state.input.imageRefs.map(image => ({ attachmentId: 'external-' + image.id,
          sha256: image.sha256, mediaType: image.mediaType }));
      }
      await save(statePath, state);
    }
    if (!state.task) {
      if (state.attempted) {
        try { state.task = await client.find(state.input.requestId); }
        catch (error) { if (error.status !== 404 || error.code !== 'TASK_NOT_FOUND') throw error; }
      }
      if (!state.task) {
        state.attempted = true;
        await save(statePath, state);
        state.task = await client.submit(state.input);
      }
      await save(statePath, state);
    }
    const until = Date.now() + waitMs;
    while (pending.has(state.task.status) && Date.now() < until) {
      await delay(Math.min(pollMs, Math.max(0, until - Date.now())));
      if (Date.now() >= until) break;
      state.task = await client.get(state.task.taskId);
      await save(statePath, state);
    }
    if (state.task.requestId !== state.input.requestId) throw new Error('REPLAY_TASK_MISMATCH');
    const images = state.images;
    const originalImages = [];
    await mkdir(resolve(outputDirectory, 'originals'), { recursive: true, mode: 0o700 });
    for (const [index, original] of originals.entries()) {
      const file = `${index}-${original.sha256}.${original.mediaType === 'image/png' ? 'png' : 'jpg'}`;
      await writeFile(resolve(outputDirectory, 'originals', file), original.bytes, { mode: 0o600 });
      originalImages.push({ file: 'originals/' + file, sha256: original.sha256,
        requestedUploadId: original.uploadId, attachmentId: state.uploads[index].attachmentId });
    }
    const report = { baseUrl, clientId, fingerprint, capturedAt: new Date().toISOString(), request: state.input,
      images, originalImages, response: state.task, reference: spec.reference ?? null, expected: spec.expected ?? null,
      contractIssues: checkReplayResult(state.task, images), humanReview: 'PENDING',
      completed: !pending.has(state.task.status) };
    await save(resolve(outputDirectory, 'report.json'), report);
    return report;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

async function main() {
  const [casePath, outputDirectory] = process.argv.slice(2);
  if (!casePath || !outputDirectory) throw new Error('CASE_AND_PRIVATE_OUTPUT_REQUIRED');
  for (const key of ['FORGE_BASE_URL', 'FORGE_CLIENT_ID', 'FORGE_CLIENT_SECRET']) {
    if (!process.env[key]) throw new Error('MISSING_' + key);
  }
  const baseUrl = process.env.FORGE_BASE_URL;
  const clientId = process.env.FORGE_CLIENT_ID;
  const client = new ForgeConsultBackendClient({ baseUrl, clientId, getClientSecret: () => process.env.FORGE_CLIENT_SECRET });
  const report = await replayCase({ client, baseUrl, clientId, casePath: resolve(casePath), outputDirectory: resolve(outputDirectory) });
  console.log(JSON.stringify({ requestId: report.response.requestId, taskId: report.response.taskId,
    status: report.response.status, completed: report.completed, contractIssues: report.contractIssues, humanReview: report.humanReview }));
  if (report.contractIssues.length > 0 || (report.completed && !['SUCCEEDED', 'NEEDS_INFORMATION'].includes(report.response.status))) process.exitCode = 1;
  else if (!report.completed) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const code = error.code ?? (/^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'REPLAY_FAILED');
    console.error(JSON.stringify({ code, message: '回放中断，请保留原检查点和请求标识核对恢复。' }));
    process.exitCode = 1;
  });
}
