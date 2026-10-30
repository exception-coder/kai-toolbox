import test from 'node:test';
import assert from 'node:assert/strict';
import { ForgeConsultClient, ConsultClientError } from '../dist/index.js';

class Socket extends EventTarget {
  readyState = 0;
  sent = [];
  constructor(url, responder) { super(); this.url = url; this.responder = responder; queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
  send(text) { const message = JSON.parse(text); this.sent.push(message); this.responder(this, message); }
  receive(event) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) })); }
  close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; const event = new Event('close'); event.code = code; this.dispatchEvent(event); }
}
function setup(t, responder, options = {}) {
  const sockets = [], http = [];
  const client = new ForgeConsultClient({
    baseUrl: 'https://forge.test', getAccessToken: () => 'private-user-token', timeoutMs: 1000,
    fetch: async (url, init) => { http.push({ url, init }); return new Response(JSON.stringify(url.endsWith('/tickets')
      ? { ticket: 'one-use-ticket', websocketPath: '/api/fore-consult/client/ws' }
      : url.includes('/attachments') ? { id: 'image', name: 'screen.png', mime: 'image/png', size: 3 }
      : { items: [{ id: '1', role: 'assistant', text: '已保存回答' }], nextBefore: null, historyGap: null })); },
    webSocketFactory: url => { const socket = new Socket(url, (s, message) => {
      if (message.type === 'auth') queueMicrotask(() => s.receive({ type: 'authenticated', protocolVersion: '1.0' }));
      else if (message.type === 'ping') s.receive({ type: 'pong' });
      else responder?.(s, message);
    }); sockets.push(socket); return socket; }, ...options,
  });
  t.after(() => client.close());
  return { client, sockets, http };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('package exports a headless client and credentials never enter WS URL', async t => {
  const { client, sockets, http } = setup(t, (s, m) => { if (m.type === 'consult.ask') s.receive({ type: 'accepted', requestId: m.requestId, consultationId: 'c' }); });
  const receipt = await client.ask({ requestId: 'question-123', question: '为什么无法审核？' });
  assert.equal(receipt.consultationId, 'c');
  assert.equal(sockets[0].url, 'wss://forge.test/api/fore-consult/client/ws');
  assert.equal(http[0].init.headers.Authorization, 'Bearer private-user-token');
  assert.equal(http[0].init.redirect, 'error');
  assert.ok(!JSON.stringify(sockets[0].sent).includes('private-user-token'));
});
test('receipt is distinct from model completion; stream snapshots and duplicate seq are handled', async t => {
  const events = [], checkpoints = [];
  const { client, sockets } = setup(t, (s, m) => { if (m.type === 'consult.ask') s.receive({ type: 'accepted', requestId: m.requestId, consultationId: 'c' }); }, { onCheckpoint: value => checkpoints.push(value) });
  client.on(event => events.push(event));
  await client.ask({ requestId: 'question-123', question: '问题' });
  sockets[0].receive({ type: 'answer.delta', seq: 2, text: '回答' });
  sockets[0].receive({ type: 'answer.delta', seq: 2, text: '重复' });
  assert.equal(events.filter(e => e.type === 'answer.delta').length, 1);
  assert.equal(events.some(e => e.type === 'completed'), false);
  assert.equal(checkpoints.at(-1).afterSeq, 2);
});
test('new runtime epoch resets replay cursor and requests persisted history', async t => {
  const events = [];
  const { client, sockets } = setup(t, undefined, { checkpoint: { consultationId: 'c', afterSeq: 80, epoch: 'old' } });
  client.on(event => events.push(event)); await client.connect();
  sockets[0].receive({ type: 'consult.ready', seq: 1, epoch: 'new', historyRequired: true }); await tick();
  assert.equal(client.state.afterSeq, 1); assert.equal(client.state.epoch, 'new');
  assert.ok(events.some(event => event.type === 'history'));
});
test('ACK timeout reports uncertainty without automatic resend', async t => {
  const { client, sockets } = setup(t, undefined, { timeoutMs: 25 });
  await assert.rejects(client.ask({ requestId: 'question-123', question: '问题' }), { code: 'SEND_STATUS_UNKNOWN' });
  assert.equal(sockets.flatMap(s => s.sent).filter(m => m.type === 'consult.ask').length, 1);
});
test('reconnect obtains a fresh ticket and only resumes the original consultation', async t => {
  const { client, sockets, http } = setup(t, (s, m) => { if (m.type === 'consult.ask') s.receive({ type: 'accepted', requestId: m.requestId, consultationId: 'c' }); });
  await client.ask({ requestId: 'question-123', question: '问题' }); sockets[0].close(1006);
  await new Promise(resolve => setTimeout(resolve, 850));
  assert.equal(sockets.length, 2); assert.equal(http.filter(h => h.url.endsWith('/tickets')).length, 2);
  assert.equal(sockets[1].sent.filter(m => m.type === 'consult.resume').length, 1);
  assert.equal(sockets[1].sent.filter(m => m.type === 'consult.ask').length, 0);
});
test('create then upload returns opaque ID and does not send a question', async t => {
  const { client, sockets, http } = setup(t, (s, m) => { if (m.type === 'consult.create') s.receive({ type: 'consult.created', requestId: m.requestId, consultationId: 'c' }); });
  await client.create({ requestId: 'reserve-123', question: '图片问题' });
  assert.equal((await client.upload(new Blob(['png']), 'screen.png')).id, 'image');
  assert.ok(http.at(-1).init.body instanceof FormData);
  assert.ok(!sockets[0].sent.some(m => m.type === 'consult.ask'));
});
test('another consultation needs a separate client and non-loopback HTTP is refused', async t => {
  assert.throws(() => new ForgeConsultClient({ baseUrl: 'http://erp.test', getAccessToken: () => 'x' }), { code: 'TLS_REQUIRED' });
  const { client } = setup(t, undefined, { checkpoint: { consultationId: 'c', afterSeq: 0 } });
  await assert.rejects(client.resume({ consultationId: 'other', afterSeq: 0 }), { code: 'BOUND_TO_OTHER_CONSULTATION' });
});
test('terminal auth rejection does not reconnect or disclose token', async t => {
  const { client, sockets } = setup(t, undefined);
  await client.connect(); sockets[0].close(1008);
  await assert.rejects(client.connect(), { code: 'CLOSED' });
  assert.equal(sockets.length, 1); assert.ok(ConsultClientError.prototype instanceof Error);
});

test('authenticated connection flapping still exhausts the retry budget', async t => {
  const opened = [];
  const { client } = setup(t, undefined, { reconnectAttempts: 1, webSocketFactory: url => {
    const socket = new Socket(url, (s, message) => {
      if (message.type === 'auth') queueMicrotask(() => {
        s.receive({ type: 'authenticated', protocolVersion: '1.0' }); s.close(1006);
      });
    }); opened.push(socket); return socket;
  } });
  await client.connect(); await new Promise(resolve => setTimeout(resolve, 1400));
  assert.equal(opened.length, 2);
});
