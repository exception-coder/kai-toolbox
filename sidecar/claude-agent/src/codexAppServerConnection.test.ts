import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import test from 'node:test'
import { createCodexAppServerConnection } from './codexAppServerConnection.js'

const peer = `
  const lines = require('node:readline').createInterface({ input: process.stdin });
  const send = message => process.stdout.write(JSON.stringify(message) + '\\n');
  let buffered;
  const replies = [];
  lines.on('line', line => {
    const message = JSON.parse(line);
    switch (message.method) {
      case 'hold': buffered = message; break;
      case 'flush':
        for (const event of message.params.events || []) send(event);
        send({ id: message.id, result: { id: message.id } });
        if (buffered) send({ id: buffered.id, result: { id: buffered.id } });
        break;
      case 'replies': send({ id: message.id, result: { replies } }); break;
      case 'crash': process.exit(7); break;
      default: replies.push(message);
    }
  });
`

function setup(t: { after: (cleanup: () => void) => void }) {
  const child = spawn(process.execPath, ['-e', peer], { windowsHide: true, stdio: 'pipe' })
  const connection = createCodexAppServerConnection(child, 500, 'shared')
  t.after(() => { connection.dispose(); child.stdin.end() })
  const attach = (thread: string) => {
    const messages: unknown[] = []
    const failures: string[] = []
    const channel = connection.attach({
      threadId: () => thread,
      turnId: () => `turn-${thread}`,
      onMessage: message => {
        messages.push(message.id ?? message.method)
        if (message.id != null) channel.send({ id: message.id, result: { owner: thread } })
      },
      onFailure: error => failures.push(error.message),
    })
    return { channel, messages, failures }
  }
  return { attach }
}

test('one pipe correlates interleaved responses and routes each approval to its current thread and turn', async t => {
  const { attach } = setup(t)
  const a = attach('a')
  const b = attach('b')
  const approve = (id: string | number, threadId?: string, turnId?: string) => ({
    id, method: 'item/commandExecution/requestApproval', params: { threadId, turnId },
  })
  const first = a.channel.request('hold', {}, 10_000)
  const second = await b.channel.request('flush', { events: [
    approve(1, 'b', 'turn-b'),
    approve('for-a', 'a', 'turn-a'),
    approve('late', 'a', 'turn-previous'),
    approve('unowned', 'detached', 'turn-detached'),
    approve('unscoped'),
    { method: 'item/started', params: { threadId: 'a' } },
    { method: 'turn/completed', params: { threadId: 'a', turn: { id: 'turn-previous' } } },
    { method: 'warning', params: { message: 'unscoped' } },
  ] }, 10_000)
  assert.deepEqual(await first, { id: 1 })
  assert.deepEqual(second, { id: 2 })
  assert.deepEqual(a.messages, ['for-a', 'item/started'])
  assert.deepEqual(b.messages, [1])
  const { replies } = await b.channel.request('replies', {}, 10_000)
  assert.deepEqual((replies as Array<{ id: string | number; result?: unknown }>).map(({ id, result }) => [id, result]), [
    [1, { owner: 'b' }], ['for-a', { owner: 'a' }], ['late', undefined], ['unowned', undefined], ['unscoped', undefined],
  ])
})

test('detaching one turn leaves the other live, and process exit fails every remaining owner', async t => {
  const { attach } = setup(t)
  const a = attach('a')
  const b = attach('b')
  const detached = assert.rejects(a.channel.request('hold', {}, 10_000), /轮次已结束/)
  a.channel.detach()
  assert.deepEqual(await b.channel.request('flush', {}, 10_000), { id: 2 })
  await detached
  const c = attach('c')
  const pending = assert.rejects(c.channel.request('hold', {}, 10_000), /异常退出.*7/)
  await assert.rejects(b.channel.request('crash', {}, 10_000), /异常退出.*7/)
  await pending
  assert.deepEqual(a.failures, [])
  assert.equal(b.failures.length, 1)
  assert.deepEqual(c.failures, b.failures)
})
