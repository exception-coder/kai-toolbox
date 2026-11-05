import test from 'node:test';
import assert from 'node:assert/strict';
import { ForgeConsultBackendClient, ConsultBackendError } from '../dist/backend.js';

const secret = 's'.repeat(43);
const token = 'fct_' + 't'.repeat(43);
const input = { agentId: 'it-support-partner', tenantId: 'tenant-a', problemId: 'IT-1', conversationId: 'IT-1',
  requestId: 'request-001', title: '打印问题', description: '点击无反应' };
const task = { taskId: 'task-1', requestId: input.requestId, status: 'QUEUED', result: null };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const authResponse = () => response({ access_token: token, token_type: 'Bearer', expires_in: 900 });

test('new contract sends caller business rules and material unchanged and preserves flexible saved results', async () => {
  const businessContext = { system: 'ERP', manualExperience: '添加供应商资料后建立仓库关联' };
  const businessInstructions = '直接给出业务结论；businessResult 返回 action 字段';
  const saved = { ...task, status: 'SUCCEEDED', result: { schemaVersion: '1.2', businessResult: { action: '关联供应商' },
    replyCandidatesGeneratedBy: 'FORGE', replyCandidates: [{ id: 'reply-1', text: '请添加供应商资料，再建立仓库与供应商关联。', evidenceIds: ['business-context'] }] } };
  let submitted = false;
  const client = new ForgeConsultBackendClient({ baseUrl: 'https://forge.example.test', clientId: 'client-1', getClientSecret: () => secret,
    fetch: async (url, init) => {
      if (url.endsWith('/token')) return authResponse();
      if (init.method === 'POST') {
        const sent = JSON.parse(init.body);
        assert.equal(sent.replyMode, 'FORGE_FLEX');
        assert.equal(sent.businessInstructions, businessInstructions);
        assert.deepEqual(sent.businessContext, businessContext);
        submitted = true;
      }
      return response(saved);
    } });
  assert.deepEqual((await client.submit({ ...input, replyMode: 'FORGE_FLEX', businessInstructions, businessContext })).result, saved.result);
  assert.deepEqual((await client.find(input.requestId)).result, saved.result);
  assert.equal(submitted, true);
});

test('backend client exchanges application credentials and keeps them out of URLs and business payloads', async () => {
  const requests = [];
  const client = new ForgeConsultBackendClient({ baseUrl: 'https://forge.example.test', clientId: 'client-1', getClientSecret: () => secret,
    fetch: async (url, init) => { requests.push({ url, init }); return url.endsWith('/token') ? authResponse() : response(task, 202); } });
  assert.equal((await client.submit(input)).taskId, 'task-1');
  assert.equal((await client.get('task-1')).status, 'QUEUED');
  assert.equal(requests.filter(r => r.url.endsWith('/token')).length, 1);
  assert.equal(requests[0].init.headers.Authorization, 'Basic ' + btoa('client-1:' + secret));
  assert.equal(requests[1].init.headers.Authorization, 'Bearer ' + token);
  for (const r of requests) {
    assert(!r.url.includes(token) && !r.url.includes(secret));
    assert.equal(r.init.redirect, 'error');
    assert(!String(r.init.body).includes(secret));
  }
});

test('submission network failure does not automatically resend and original request can be looked up', async () => {
  let submits = 0;
  const client = new ForgeConsultBackendClient({ baseUrl: 'https://forge.example.test', clientId: 'client-1', getClientSecret: () => secret,
    fetch: async (url, init) => {
      if (url.endsWith('/token')) return authResponse();
      if (init.method === 'POST') { submits++; throw new Error('lost after send'); }
      assert(url.endsWith('?requestId=request-001')); return response(task);
    } });
  await assert.rejects(client.submit(input), e => e instanceof ConsultBackendError && e.code === 'REQUEST_STATUS_UNKNOWN');
  assert.equal(submits, 1);
  assert.equal((await client.find(input.requestId)).taskId, task.taskId);
});

test('backend auth failure is surfaced and refresh is explicit on the next caller action', async () => {
  let authentications = 0; let reads = 0;
  const client = new ForgeConsultBackendClient({ baseUrl: 'https://forge.example.test', clientId: 'client-1', getClientSecret: () => secret,
    fetch: async url => {
      if (url.endsWith('/token')) { authentications++; return authResponse(); }
      reads++; return response({ code: 'INVALID_CLIENT_TOKEN', message: '授权已撤销', traceId: 'trace', retryable: false }, 401);
    } });
  await assert.rejects(client.get('task-1'), e => e.code === 'INVALID_CLIENT_TOKEN' && e.traceId === 'trace');
  assert.equal(authentications, 1); assert.equal(reads, 1);
  await assert.rejects(client.get('task-1'));
  assert.equal(authentications, 2); assert.equal(reads, 2);
});

test('cancel returns cancellation request without inventing a confirmed terminal state', async () => {
  const client = new ForgeConsultBackendClient({ baseUrl: 'http://127.0.0.1:18080', clientId: 'client-1', getClientSecret: () => secret,
    fetch: async (url, init) => {
      if (url.endsWith('/token')) return authResponse();
      assert(url.endsWith('/task-1/cancel')); assert.equal(init.method, 'POST');
      return response({ ...task, status: 'CANCEL_REQUESTED' }, 202);
    } });
  assert.equal((await client.cancel('task-1')).status, 'CANCEL_REQUESTED');
});

test('backend client rejects insecure or credential-bearing URLs and malformed token replies', async () => {
  for (const baseUrl of ['http://remote.example.com', 'https://user:pass@forge.example.com', 'https://forge.example.com/?token=x']) {
    assert.throws(() => new ForgeConsultBackendClient({ baseUrl, clientId: 'client-1', getClientSecret: () => secret }));
  }
  const client = new ForgeConsultBackendClient({ baseUrl: 'https://forge.example.test', clientId: 'client-1', getClientSecret: () => secret,
    fetch: async () => response({ access_token: 'not-valid', expires_in: 900, token_type: 'Bearer' }) });
  await assert.rejects(client.submit(input), e => e.code === 'INVALID_TOKEN_RESPONSE');
});

const image = { attachmentId: 'img_11111111-1111-4111-8111-111111111111', uploadId: 'upload-001',
  sha256: 'a'.repeat(64), mediaType: 'image/png', size: 3, width: 2, height: 2, createdAt: 1000, expiresAt: 86401000 };

test('application upload sends exact original bytes and uses a separate recoverable upload identity', async () => {
  const requests = [];
  const bytes = new Uint8Array([1, 2, 3]);
  const client = new ForgeConsultBackendClient({ baseUrl: 'http://127.0.0.1:18080', clientId: 'client-1', getClientSecret: () => secret,
    fetch: async (url, init) => {
      if (url.endsWith('/token')) return authResponse();
      requests.push({ url, init });
      if (init.method === 'POST' && url.includes('/attachments')) {
        assert.equal(init.headers['Content-Type'], 'image/png');
        assert.deepEqual(new Uint8Array(await init.body.arrayBuffer()), bytes);
        return response(image);
      }
      if (url.includes('/analysis-tasks')) {
        const sent = JSON.parse(init.body);
        assert.deepEqual(sent.attachmentIds, [image.attachmentId]);
        assert.equal(sent.replyMode, 'FORGE');
        assert.equal(sent.requestId, input.requestId);
        return response({ ...task, attachmentIds: sent.attachmentIds }, 202);
      }
      return response(image);
    } });
  assert.equal((await client.uploadImage(image.uploadId, bytes, 'image/png')).attachmentId, image.attachmentId);
  assert.equal((await client.findImage(image.uploadId)).sha256, image.sha256);
  assert.equal((await client.getImage(image.attachmentId)).attachmentId, image.attachmentId);
  await client.submit({ ...input, attachmentIds: [image.attachmentId], replyMode: 'FORGE' });
  assert.equal(requests.length, 4);
  assert(requests.every(r => r.init.headers.Authorization === 'Bearer ' + token));
});

test('upload timeout does not resend, owner recovery and expiry keep their own error contract', async () => {
  let uploads = 0;
  const client = new ForgeConsultBackendClient({ baseUrl: 'https://forge.example.test', clientId: 'client-1', getClientSecret: () => secret,
    fetch: async (url, init) => {
      if (url.endsWith('/token')) return authResponse();
      assert(url.endsWith('/attachments?uploadId=upload-001'));
      if (init.method === 'POST') { uploads++; throw new Error('response lost'); }
      return response({ code: 'ATTACHMENT_EXPIRED', message: '原图已过期', retryable: false }, 410);
    } });
  await assert.rejects(client.uploadImage('upload-001', new Uint8Array([1]), 'image/png'), e => e.code === 'REQUEST_STATUS_UNKNOWN');
  assert.equal(uploads, 1);
  await assert.rejects(client.findImage('upload-001'), e => e.code === 'ATTACHMENT_EXPIRED' && e.status === 410);
});

test('image SDK rejects invalid input and malformed metadata without inventing a usable attachment', async () => {
  let calls = 0;
  const client = new ForgeConsultBackendClient({ baseUrl: 'https://forge.example.test', clientId: 'client-1', getClientSecret: () => secret,
    fetch: async url => { calls++; return url.endsWith('/token') ? authResponse() : response({ ...image, sha256: 'bad' }); } });
  await assert.rejects(client.uploadImage('short', new Uint8Array([1]), 'image/png'), e => e.code === 'INVALID_IMAGE_INPUT');
  await assert.rejects(client.uploadImage('upload-001', new Uint8Array(), 'image/jpeg'), e => e.code === 'INVALID_IMAGE_INPUT');
  assert.equal(calls, 0);
  await assert.rejects(client.getImage(image.attachmentId), e => e.code === 'INVALID_IMAGE_RESPONSE');
});
