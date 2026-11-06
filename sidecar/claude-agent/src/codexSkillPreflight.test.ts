import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { callAppServerBatch, prepareCodexProjectSkills, type MetadataDiagnostics } from './codexAppServer.js'
import { CodexRpcTimeoutError } from './engine/codexRpcPolicy.js'
import { observeCodexProcess } from './codexProcessLifetime.js'

function peer(mode = 'complete') {
  const child = spawn(process.execPath, ['-e', `
    const mode=${JSON.stringify(mode)};
    const rl=require('node:readline').createInterface({input:process.stdin});
    const send=value=>process.stdout.write(JSON.stringify(value)+'\\n');
    const watchdog=setTimeout(()=>process.exit(91),15000);
    process.stdin.on('end',()=>{clearTimeout(watchdog);process.exit(0)});
    rl.on('line',line=>{
      const m=JSON.parse(line); if(m.method) process.send?.(m.method);
      if(m.method==='initialize') {
        if(mode!=='initializeStall') setTimeout(()=>send({id:m.id,result:{}}),200);
      } else if(m.method==='skills/list') {
        if(mode==='skillsStall') return;
        if(mode==='reverseRequest') send({id:m.id,method:'tool/requestUserInput',params:{}});
        if(mode==='rpcError'){send({id:m.id,error:{message:'fixture configuration rejected'}});return;}
        setTimeout(()=>send({id:m.id,result:{data:[],marker:'skills'}}),40);
      } else if(m.method==='config/read') send({id:m.id,result:{config:{skills:{config:[]}},marker:'config'}});
    });
  `], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true }) as ChildProcessWithoutNullStreams
  const lifetime = observeCodexProcess(child)
  const methods: string[] = []
  child.on('message', method => methods.push(String(method)))
  return { child, lifetime, methods }
}

const requests = [{ method: 'skills/list', params: { cwds: ['fixture'], forceReload: false } },
  { method: 'config/read', params: { cwd: 'fixture', includeLayers: false } }]

test('a cold handshake surviving the ordinary 20s budget can still finish without a retry', async t => {
  const process = peer()
  let opens = 0
  const runtime = { open: () => { opens++; return process.child }, stop: () => process.child.stdin.end(), closeTimeoutMs: 2000 }
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const result = callAppServerBatch(requests, undefined, runtime)
  // Simulate a busy host before the child answers; ordinary request timers have not started yet.
  t.mock.timers.tick(25_000)
  try {
    assert.deepEqual((await result).map(row => row.marker), ['skills', 'config'])
    assert.equal(opens, 1)
    assert.equal(await process.lifetime.wait(0), true)
    assert.ok(!process.methods.includes('turn/start'))
  } finally { t.mock.timers.reset() }
})

test('shares one handshake, preserves response order and gives RPC its own clock', async () => {
  const process = peer('reverseRequest')
  let opens = 0
  const trace: MetadataDiagnostics[] = []
  const runtime = { open: () => { opens++; return process.child }, stop: () => process.child.stdin.end(), closeTimeoutMs: 2000 }
  const result = await callAppServerBatch(requests, undefined, runtime,
    { initializeTimeoutMs: 3000, requestTimeoutMs: 150, observe: event => trace.push(event) })
  assert.equal(opens, 1)
  assert.deepEqual(result.map(row => row.marker), ['skills', 'config'])
  assert.equal(trace.filter(row => row.method === 'initialize' && row.phase === 'completed').length, 1)
  assert.ok(trace.find(row => row.method === 'skills/list' && row.phase === 'request_sent')!.elapsedMs >= 200)
  assert.equal(await process.lifetime.wait(0), true)
})

test('distinguishes initialization timeout from a stalled skills response', async () => {
  for (const mode of ['initializeStall', 'skillsStall']) {
    const process = peer(mode)
    const runtime = { open: () => process.child, stop: () => process.child.stdin.end(), closeTimeoutMs: 2000 }
    await assert.rejects(callAppServerBatch(requests, undefined, runtime,
      { initializeTimeoutMs: mode === 'initializeStall' ? 100 : 3000, requestTimeoutMs: 60 }), error => {
      assert.ok(error instanceof CodexRpcTimeoutError)
      assert.equal(error.phase, mode === 'initializeStall' ? 'initialize' : 'request')
      return true
    })
    assert.equal(await process.lifetime.wait(0), true)
    assert.ok(!process.methods.includes('turn/start'))
  }
})

test('preflight retries a timeout once after release, but never retries RPC errors or cancellation', async t => {
  const project = await mkdtemp(join(tmpdir(), 'forge-preflight-'))
  await mkdir(join(project, '.agents'), { recursive: true })
  await writeFile(join(project, '.agents/skill-providers.json'), '{}')
  t.after(() => rm(project, { recursive: true, force: true }))
  for (const scenario of ['recover', 'exhaust', 'rpcError', 'abort', 'abortInitialize']) {
    const children: ReturnType<typeof peer>[] = []
    const controller = new AbortController()
    const events: Record<string, unknown>[] = []
    const runtime = {
      open: () => {
        if (children.length) assert.equal(children.at(-1)!.child.exitCode, 0, 'previous native process must exit before retry')
        const process = peer(scenario === 'abortInitialize' ? 'initializeStall' : scenario === 'rpcError' ? 'rpcError' : scenario === 'recover' && children.length ? 'complete' : 'skillsStall')
        children.push(process)
        if (scenario === 'abort' || scenario === 'abortInitialize') process.child.on('message', method => {
          if (method === (scenario === 'abortInitialize' ? 'initialize' : 'skills/list')) controller.abort(new Error('fixture cancelled'))
        })
        return process.child
      },
      stop: () => { children.at(-1)!.child.stdin.end() }, closeTimeoutMs: 2000,
    }
    const result = prepareCodexProjectSkills({ cwd: project, codexHome: '/fixture', sessionId: 'original-session',
      signal: controller.signal, emit: event => { events.push(event) } }, () => {}, runtime,
      { initializeTimeoutMs: 3000, requestTimeoutMs: 80 })
    if (scenario === 'recover') assert.deepEqual(await result, [])
    else await assert.rejects(result, scenario === 'exhaust' ? CodexRpcTimeoutError : scenario === 'rpcError' ? /configuration rejected/ : /cancelled/)
    assert.equal(children.length, scenario === 'recover' || scenario === 'exhaust' ? 2 : 1)
    assert.equal(events.length, scenario === 'recover' || scenario === 'exhaust' ? 1 : 0)
    for (const child of children) { assert.equal(await child.lifetime.wait(0), true); assert.ok(!child.methods.includes('turn/start')) }
  }
})
