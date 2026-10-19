import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Codex, type ThreadEvent } from '@openai/codex-sdk'
import { readCodexSdkTurnEvents, withCodexSdkLifecycle, requestCodexSdkCleanup } from './codexSdkLifecycle.js'

async function sdkFixture(t: TestContext, mode: 'completed' | 'waiting' | 'failed' = 'completed') {
  const directory = await mkdtemp(join(tmpdir(), 'forge-sdk-lifecycle-'))
  const previousDirectory = process.cwd()
  process.chdir(directory)
  t.after(async () => { process.chdir(previousDirectory); await rm(directory, { recursive: true, force: true }) })
  // The real SDK runs `node exec --experimental-json`; this local executable
  // fixture has the same protocol and pipes, without accounts or model calls.
  await writeFile(join(directory, 'exec'), `
    const {spawn} = require('node:child_process');
    const write = event => process.stdout.write(JSON.stringify(event)+'\\n');
    const env = {...process.env}; delete env.NODE_OPTIONS;
    const child = spawn(process.execPath, ['-e', 'process.send("ready");setTimeout(()=>process.exit(0),3000)'],
      {stdio:['ignore',1,2,'ipc'],env,windowsHide:true});
    child.unref();
    child.once('message', () => {
      child.disconnect();
      write({type:'thread.started',thread_id:'fixture-thread'});
      write({type:'turn.started'});
      if (${JSON.stringify(mode)} !== 'waiting') {
        write({type:'item.completed',item:{id:'answer',type:'agent_message',text:'final answer'}});
        write(${JSON.stringify(mode)} === 'failed' ? {type:'turn.failed',error:{message:'fixture failure'}}
          : {type:'turn.completed',usage:{input_tokens:2,output_tokens:3}});
        setTimeout(()=>process.exit(0),2500);
      } else setTimeout(()=>process.exit(0),5000);
    });
  `)
  const client = new Codex({ codexPathOverride: process.execPath })
  return client.startThread()
}

test('reproduces SDK EOF wait after a completed native turn leaves the stream open', async t => {
  const thread = await sdkFixture(t)
  const events = (await thread.runStreamed('fixture only')).events
  let completed = false
  const pending = (async () => {
    for await (const event of events) if (event.type === 'turn.completed') completed = true
  })()
  while (!completed) await delay(10)
  assert.equal(await Promise.race([pending.then(() => 'settled'), delay(400, 'waiting')]), 'waiting')
  await pending
})

test('settles real SDK stream after native exit, preserving final events without killing descendants', async t => {
  const thread = await sdkFixture(t)
  const received: ThreadEvent[] = []
  const pending = withCodexSdkLifecycle({ sessionId: 'sdk-completed', signal: new AbortController().signal }, async () => {
    for await (const event of readCodexSdkTurnEvents((await thread.runStreamed('fixture only')).events)) received.push(event)
  })
  assert.equal(await Promise.race([pending.then(() => 'settled'), delay(1500, 'waiting')]), 'settled')
  await pending
  assert.equal(received.filter(event => event.type === 'turn.completed').length, 1)
  assert.equal(received.some(event => event.type === 'item.completed' && event.item.type === 'agent_message'
    && event.item.text === 'final answer'), true)
  assert.equal(await requestCodexSdkCleanup('sdk-completed'), false)
})

test('cancellation closes a real SDK read even if a descendant retains output pipes', async t => {
  const thread = await sdkFixture(t, 'waiting')
  const controller = new AbortController()
  let started = false
  const pending = withCodexSdkLifecycle({ sessionId: 'sdk-interrupted', signal: controller.signal }, async () => {
    for await (const event of (await thread.runStreamed('fixture only', { signal: controller.signal })).events) {
      if (event.type === 'thread.started') started = true
    }
  })
  const rejected = assert.rejects(pending, /abort|signal|exited/i)
  while (!started) await delay(10)
  assert.equal(await requestCodexSdkCleanup('other-session'), false)
  controller.abort()
  assert.equal(await Promise.race([rejected.then(() => 'settled'), delay(1500, 'waiting')]), 'settled')
  await rejected
  assert.equal(await requestCodexSdkCleanup('sdk-interrupted'), false)
})

test('failed terminal events also close the SDK iterator without waiting for EOF', async t => {
  const thread = await sdkFixture(t, 'failed')
  const received: ThreadEvent[] = []
  await withCodexSdkLifecycle({ sessionId: 'sdk-failed', signal: new AbortController().signal }, async () => {
    for await (const event of readCodexSdkTurnEvents((await thread.runStreamed('fixture only')).events)) received.push(event)
  })
  assert.equal(received.filter(event => event.type === 'turn.failed').length, 1)
  assert.equal(received.some(event => event.type === 'turn.completed'), false)
})

test('a stop retry cancels only its owned SDK process while another session continues', async t => {
  const thread = await sdkFixture(t, 'waiting')
  const controllers = [new AbortController(), new AbortController()]
  const started = [false, false]
  const settled = [false, false]
  const runs = controllers.map((controller, index) => withCodexSdkLifecycle({
    sessionId: `sdk-isolated-${index}`, signal: controller.signal,
  }, async () => {
    for await (const event of (await thread.runStreamed('fixture only', { signal: controller.signal })).events) {
      if (event.type === 'thread.started') started[index] = true
    }
  }).then(() => { settled[index] = true }, () => { settled[index] = true }))
  try {
    while (started.some(value => !value)) await delay(10)
    assert.equal(await requestCodexSdkCleanup('sdk-isolated-0'), true)
    await runs[0]
    assert.equal(settled[0], true)
    assert.equal(settled[1], false)
  } finally {
    controllers.forEach(controller => controller.abort())
    await Promise.all(runs)
  }
})

test('an SDK operation without owned-process evidence cannot report completion', async () => {
  await assert.rejects(withCodexSdkLifecycle({ sessionId: 'no-sdk-process', signal: new AbortController().signal },
    async () => undefined), /未取得.*退出证据/)
})
