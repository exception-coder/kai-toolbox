import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { replayCase, checkReplayResult } from '../examples/backend-replay.mjs';

const input = { agentId: 'it-support-partner', tenantId: 'tenant-a', problemId: 'IT-1', conversationId: 'IT-1',
  requestId: 'replay-001', title: '仓库关联', description: '更正：供应商已存在', replyMode: 'FORGE_FLEX' };
const result = { schemaVersion: '1.2', businessResult: null, missingInformation: [],
  humanHandoff: { recommended: true, reason: '需人工核查仓库关联' }, replyCandidates: [], evidence: [] };
const task = { taskId: 'task-1', requestId: input.requestId, status: 'SUCCEEDED', result };

test('lost submit resumes the original task and completed replay performs no new model request', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'forge-replay-'));
  try {
    const casePath = join(directory, 'case.json');
    await writeFile(casePath, JSON.stringify({ input, reference: { answer: '人工答案', reason: '人工说明' } }));
    let submits = 0;
    let finds = 0;
    const client = {
      submit: async actual => { assert.deepEqual(actual, input); submits++; throw Object.assign(new Error(), { code: 'REQUEST_STATUS_UNKNOWN' }); },
      find: async key => { assert.equal(key, input.requestId); finds++; return task; },
    };
    const options = { client, baseUrl: 'https://forge.example.test', clientId: 'client-1', casePath,
      outputDirectory: join(directory, 'private'), waitMs: 0 };
    await assert.rejects(replayCase(options), error => error.code === 'REQUEST_STATUS_UNKNOWN');
    const report = await replayCase(options);
    assert.equal(report.response.taskId, task.taskId);
    assert.equal(report.reference.answer, '人工答案');
    assert.equal(report.humanReview, 'PENDING');
    assert.deepEqual(report.contractIssues, []);
    await writeFile(casePath, JSON.stringify({ input, reference: { answer: '补充人工认可答案' } }));
    assert.equal((await replayCase(options)).reference.answer, '补充人工认可答案');
    await replayCase(options);
    assert.equal(submits, 1);
    assert.equal(finds, 1);
    const checkpoint = JSON.parse(await readFile(join(options.outputDirectory, 'checkpoint.json'), 'utf8'));
    assert.deepEqual(checkpoint.input, input);
    await writeFile(casePath, JSON.stringify({ input: { ...input, description: '变化的输入' } }));
    await assert.rejects(replayCase(options), /REPLAY_INPUT_CHANGED/);
    await writeFile(casePath, JSON.stringify({ input }));
    await assert.rejects(replayCase({ ...options, clientId: 'other-client' }), /REPLAY_INPUT_CHANGED/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('original bytes and upload checkpoints survive a lost submit and image metadata remains available after expiry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'forge-replay-images-'));
  try {
    const bytes = new Uint8Array([1, 2, 3]);
    await writeFile(join(directory, 'picture.png'), bytes);
    const casePath = join(directory, 'case.json');
    await writeFile(casePath, JSON.stringify({ input, images: [{ path: 'picture.png', uploadId: 'upload-001', mediaType: 'image/png' }] }));
    let uploads = 0;
    let submits = 0;
    const image = { attachmentId: 'img_11111111-1111-4111-8111-111111111111', sha256: createHash('sha256').update(bytes).digest('hex'), size: 3, mediaType: 'image/png' };
    const client = {
      uploadOrReuseImage: async (id, actual) => { uploads++; assert.equal(id, 'upload-001'); assert.deepEqual(actual, Buffer.from(bytes)); return image; },
      submit: async actual => { submits++; assert.deepEqual(actual.attachmentIds, [image.attachmentId]); throw Object.assign(new Error(), { code: 'REQUEST_STATUS_UNKNOWN' }); },
      find: async () => ({ ...task, result: { ...result, imageInputs: [image], imageObservations: [{ attachmentId: image.attachmentId, readable: true, observation: '可见仓库页面' }] } }),
      getImage: async () => { throw new Error('expired'); },
    };
    const options = { client, baseUrl: 'https://forge.example.test', clientId: 'client-1', casePath, outputDirectory: join(directory, 'private'), waitMs: 0 };
    await assert.rejects(replayCase(options));
    const report = await replayCase(options);
    assert.deepEqual(report.contractIssues, []);
    await replayCase(options);
    assert.equal(uploads, 1);
    assert.equal(submits, 1);
    assert.deepEqual(report.images, [image]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('an unknown lookup does not submit again and a polling deadline retains the original task', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'forge-replay-pending-'));
  try {
    const casePath = join(directory, 'case.json');
    await writeFile(casePath, JSON.stringify({ input }));
    let submits = 0;
    const client = {
      submit: async () => { submits++; throw Object.assign(new Error(), { code: 'REQUEST_STATUS_UNKNOWN' }); },
      find: async () => { throw Object.assign(new Error(), { code: 'REQUEST_STATUS_UNKNOWN' }); },
    };
    const options = { client, baseUrl: 'https://forge.example.test', clientId: 'client-1', casePath, outputDirectory: join(directory, 'private'), waitMs: 0 };
    await assert.rejects(replayCase(options));
    await assert.rejects(replayCase(options));
    assert.equal(submits, 1);
    client.find = async () => ({ ...task, status: 'RUNNING', result: null });
    assert.equal((await replayCase(options)).completed, false);
    client.get = async id => { assert.equal(id, task.taskId); return task; };
    assert.equal((await replayCase({ ...options, waitMs: 100, pollMs: 1 })).completed, true);
    assert.equal(submits, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('consumer checks keep missing fields, invented evidence and wrong images distinct from human review', () => {
  assert.deepEqual(checkReplayResult(task, []), []);
  const missing = structuredClone(task);
  delete missing.result.businessResult;
  assert.deepEqual(checkReplayResult(missing, []), ['INVALID_FLEX_RESULT']);
  const invalid = structuredClone(task);
  invalid.result.replyCandidates = [{ id: 'reply-1', text: '客户回复', evidenceIds: ['invented'] }];
  assert(checkReplayResult(invalid, []).includes('INVALID_CANDIDATE'));
  assert(checkReplayResult(task, [{ attachmentId: 'image-1', sha256: 'a'.repeat(64) }]).includes('IMAGE_MAPPING_MISMATCH'));
  const empty = structuredClone(task);
  empty.result.humanHandoff.recommended = false;
  assert(checkReplayResult(empty, []).includes('EMPTY_WITHOUT_HANDOFF'));
  assert.deepEqual(checkReplayResult({ ...task, status: 'FAILED', result: null, error: { code: 'IMAGE_NOT_READABLE' } }, []), []);
});
