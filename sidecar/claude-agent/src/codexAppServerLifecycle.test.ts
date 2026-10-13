import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { callAppServer, createCodexPredictionProcess, runCodexAppServerTurn, steerCodexAppServerTurn, CodexAppServerTurnError } from './codexAppServer.js'
import { CodexPredictionCoordinator, readCodexPrediction } from './codexPrediction.js'
import { observeCodexProcess } from './codexProcessLifetime.js'

// Real pipes and EOF, with a local JSON-RPC peer: no account, tools or model calls.
function fixture(mode: 'complete' | 'hold' | 'holdError' | 'cancel' | 'rpcError' | 'crash' | 'steer' = 'complete') {
  const child = spawn(process.execPath, ['-e', `
    const mode = ${JSON.stringify(mode)};
    const rl = require('node:readline').createInterface({input:process.stdin});
    const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
    const watchdog = setTimeout(() => process.exit(91), 20000);
    let draining = false;
    function drain() {
      if (draining) return;
      draining = true;
      clearTimeout(watchdog);
      let pending = 2;
      const done = () => { if (--pending === 0) process.exit(0); };
      process.stdout.write('o'.repeat(1024*1024), done);
      process.stderr.write('e'.repeat(1024*1024), done);
    }
    process.on('message', message => { if (message === 'release') drain(); });
    process.stdin.on('end', () => { if (!mode.startsWith('hold')) drain(); });
    function complete() {
      send({method:'item/completed',params:{threadId:'lifecycle-thread',turnId:'lifecycle-turn',
        item:{type:'agentMessage',id:'answer',text:'fixture answer'}}});
      send({method:'turn/completed',params:{threadId:'lifecycle-thread',turn:{id:'lifecycle-turn',status:'completed'}}});
    }
    rl.on('line', line => {
      const m = JSON.parse(line);
      if (m.id == null) return;
      if (mode === 'rpcError' || mode === 'holdError') { send({id:m.id,error:{message:'fixture RPC failed'}}); return; }
      if (m.method === 'thread/start' || m.method === 'thread/resume') {
        send({id:m.id,result:{thread:{id:'lifecycle-thread'}}});
      } else if (m.method === 'turn/start') {
        send({id:m.id,result:{turn:{id:'lifecycle-turn'}}});
        process.send?.('turn-started');
        if (mode === 'cancel') return;
        if (mode === 'crash') { process.exit(23); return; }
        if (mode === 'steer') {
          setTimeout(() => send({method:'item/agentMessage/delta',params:{threadId:'lifecycle-thread',turnId:'lifecycle-turn',delta:'ready'}}), 20);
          return;
        }
        setImmediate(complete);
      } else if (m.method === 'turn/steer') {
        complete(); // The turn ends without acknowledging the concurrent steer.
      } else if (m.method === 'turn/interrupt') {
        send({id:m.id,result:{}});
        send({method:'turn/completed',params:{threadId:'lifecycle-thread',turn:{id:'lifecycle-turn',status:'interrupted'}}});
      } else if (m.method === 'thread/prediction/request') {
        send({id:m.id,result:{}});
        send({method:'thread/prediction/updated',params:{threadId:'lifecycle-thread',sourceTurnId:'lifecycle-turn',
          result:{type:'completed',text:'fixture suggestion'}}});
      } else send({id:m.id,result:{data:[]}});
    });
  `], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true }) as ChildProcessWithoutNullStreams
  const lifetime = observeCodexProcess(child)
  let stops = 0
  let opens = 0
  const runtime = {
    open: () => { opens++; return child },
    stop: () => { stops++ },
    closeTimeoutMs: mode.startsWith('hold') ? 50 : 2_000,
  }
  return { child, lifetime, runtime, get stops() { return stops }, get opens() { return opens },
    async release() {
      if (child.connected) child.send('release')
      child.stdin.end()
      child.stdout.resume()
      child.stderr.resume()
      assert.equal(await lifetime.wait(3_000), true, 'fixture must close without termination')
    },
  }
}

const turnOptions = (sessionId: string, events: Record<string, unknown>[] = [], signal = new AbortController().signal) => ({
  sessionId, threadId: 'lifecycle-thread', cwd: process.cwd(), codexHome: `/nonexistent/${sessionId}`,
  sandbox: 'read-only' as const, approvalPolicy: 'never' as const,
  input: [{ type: 'text', text: 'fixture only' }], signal, emit: (event: Record<string, unknown>) => { events.push(event) },
  setThreadId: () => {},
})

test('consecutive main sends interleaved with predictions wait for native close and drain both pipes', async () => {
  const events: Record<string, unknown>[] = []
  for (let index = 0; index < 2; index++) {
    const main = fixture()
    try {
      await runCodexAppServerTurn(turnOptions('consecutive', events), main.runtime)
      assert.equal(await main.lifetime.wait(0), true)
      assert.equal(main.stops, 0)
    } finally { await main.release() }
    const prediction = fixture()
    const coordinator = new CodexPredictionCoordinator((options, signal) => readCodexPrediction(options, signal, {
      open: () => createCodexPredictionProcess(undefined, prediction.runtime), timeoutMs: 2_000,
    }))
    try {
      coordinator.start({ ...turnOptions('consecutive', events), sourceTurnId:'lifecycle-turn' })
      assert.equal(await prediction.lifetime.wait(3_000), true)
      // Close wakes native observers before the coordinator publishes its result.
      await new Promise(resolve => setImmediate(resolve))
      await coordinator.cancel('lifecycle-thread', '/nonexistent/consecutive')
      assert.equal(prediction.stops, 0)
    } finally { await prediction.release() }
  }
  const results = events.filter(event => event.type === 'result')
  assert.equal(results.length, 2)
  assert.ok(results.every(event => event.queueReleaseSafe === true))
  assert.equal(events.filter(event => event.type === 'codexPrediction').length, 2)
})

test('main cleanup failure rejects two more sends without spawning, then recovers after original close', async () => {
  const stuck = fixture('hold')
  const events: Record<string, unknown>[] = []
  const options = turnOptions('cleanup-barrier', events)
  try {
    await assert.rejects(runCodexAppServerTurn(options, stuck.runtime), error =>
      error instanceof CodexAppServerTurnError && !error.retrySafe && /清理超时/.test(error.message))
    assert.equal(events.some(event => event.type === 'result'), false)
    for (let index = 0; index < 2; index++) {
      await assert.rejects(runCodexAppServerTurn(options, stuck.runtime), /已阻止新轮次/)
    }
    assert.equal(stuck.opens, 1)
    assert.equal(stuck.stops, 1)
  } finally { await stuck.release() }
  for (let index = 0; index < 2; index++) {
    const next = fixture()
    try { await runCodexAppServerTurn(options, next.runtime) } finally { await next.release() }
  }
  assert.equal(events.filter(event => event.type === 'result').length, 2)
})

test('one-shot success and RPC failure both close native pipes before resolving or rejecting', async () => {
  for (const mode of ['complete', 'rpcError'] as const) {
    const process = fixture(mode)
    try {
      const result = callAppServer('model/list', {}, undefined, process.runtime)
      if (mode === 'rpcError') await assert.rejects(result, /fixture RPC failed/)
      else assert.deepEqual(await result, {data:[]})
      assert.equal(await process.lifetime.wait(0), true)
      assert.equal(process.stops, 0)
    } finally { await process.release() }
  }
})

test('one-shot cleanup failure preserves the RPC error as well as the release error', async () => {
  const process = fixture('holdError')
  try {
    await assert.rejects(callAppServer('model/list', {}, undefined, process.runtime), error => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /进程清理失败/)
      assert.ok(error.cause instanceof AggregateError)
      assert.match(error.cause.errors[0].message, /fixture RPC failed/)
      assert.match(error.cause.errors[1].message, /仍未退出/)
      return true
    })
  } finally { await process.release() }
})

test('cancellation after turn acceptance closes cleanly and does not release the queue as success', async () => {
  const process = fixture('cancel')
  const controller = new AbortController()
  const events: Record<string, unknown>[] = []
  process.child.once('message', () => controller.abort())
  try {
    await runCodexAppServerTurn(turnOptions('cancelled', events, controller.signal), process.runtime)
    assert.equal(await process.lifetime.wait(0), true)
    const result = events.find(event => event.type === 'result')
    assert.equal(result?.queueReleaseSafe, false)
    assert.equal(result?.stopReason, 'interrupted')
  } finally { await process.release() }
})

test('an accepted turn that crashes is not safe to replay; an already-aborted turn never spawns', async () => {
  const process = fixture('crash')
  try {
    await assert.rejects(runCodexAppServerTurn(turnOptions('crashed'), process.runtime), error =>
      error instanceof CodexAppServerTurnError && !error.retrySafe && /异常退出/.test(error.message))
    assert.equal(await process.lifetime.wait(0), true)
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(runCodexAppServerTurn(turnOptions('aborted', [], controller.signal), process.runtime), /abort/i)
    assert.equal(process.opens, 1)
  } finally { await process.release() }
})

test('ending a turn settles a pending steer and removes its active routing entry', async () => {
  const process = fixture('steer')
  let outcome = 'pending'
  const options = turnOptions('pending-steer')
  options.emit = event => {
    if (event.type === 'assistantDelta') {
      void steerCodexAppServerTurn(options.sessionId, [{ type: 'text', text: 'more' }]).then(
        () => { outcome = 'accepted' }, error => { outcome = (error as Error).message },
      )
    }
  }
  try {
    await runCodexAppServerTurn(options, process.runtime)
    await new Promise(resolve => setImmediate(resolve))
    assert.match(outcome, /轮次已结束/)
    assert.equal(await steerCodexAppServerTurn(options.sessionId, []), false)
  } finally { await process.release() }
})
