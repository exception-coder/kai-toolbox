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
