import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { watchParentLifetime, stopWithinDeadline } from './parentLifetime.js'

test('parent input end/close/error requests shutdown once', async () => {
  const input = new PassThrough()
  const reasons: string[] = []
  watchParentLifetime(input, reason => reasons.push(reason))
  input.end()
  await delay(10)
  input.destroy()
  assert.deepEqual(reasons, ['parent-stdin-closed'])
})

test('broken parent logging pipes cannot recurse through uncaught exceptions during shutdown', () => {
  const input = new PassThrough(), output = new PassThrough()
  const reasons: string[] = []
  watchParentLifetime(input, reason => reasons.push(reason), [output])
  output.emit('error', new Error('EPIPE'))
  output.emit('error', new Error('EPIPE'))
  input.destroy()
  assert.deepEqual(reasons, ['parent-output-closed'])
})

test('hung async cleanup has a hard exit bound and successful cleanup exits once', async () => {
  const hung: number[] = [], done: number[] = []
  let release!: () => void
  stopWithinDeadline(() => new Promise<void>(yes => { release = yes }), code => hung.push(code), 20)
  stopWithinDeadline(async () => {}, code => done.push(code), 20)
  await delay(50)
  release()
  await delay(5)
  assert.deepEqual(hung, [1])
  assert.deepEqual(done, [0])
})

test('real parent process exit closes the private pipe and retires its child listener', { timeout: 8000 }, async () => {
  const marker = join(mkdtempSync(join(tmpdir(), 'sidecar-parent-pipe-')), 'stopped.txt')
  const moduleUrl = new URL('./parentLifetime.js', import.meta.url).href
  const childCode = `import {watchParentLifetime} from ${JSON.stringify(moduleUrl)};
    import {createServer} from 'node:net';
    import {writeFileSync} from 'node:fs';
    const server=createServer(socket=>socket.end());
    server.listen(0,'127.0.0.1',()=>console.log('listener-ready'));
    watchParentLifetime(process.stdin,reason=>{writeFileSync(${JSON.stringify(marker)},reason);server.close(()=>process.exit(0));});
    setTimeout(()=>process.exit(2),3000).unref();`
  const parentCode = `import {spawn} from 'node:child_process';
    spawn(process.execPath,['--input-type=module','-e',${JSON.stringify(childCode)}],{stdio:['pipe','inherit','inherit'],detached:true,windowsHide:true});
    setTimeout(()=>process.exit(0),300);`
  const parent = spawn(process.execPath, ['--input-type=module', '-e', parentCode], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  parent.stdout.on('data', chunk => { output += chunk })
  parent.stderr.on('data', chunk => { output += chunk })
  const code = await new Promise<number | null>((yes, no) => { parent.once('error', no); parent.once('close', yes) })
  assert.equal(code, 0, output)
  assert.match(output, /listener-ready/)
  for (let attempt = 0; attempt < 60 && !existsSync(marker); attempt++) await delay(25)
  assert.equal(readFileSync(marker, 'utf8'), 'parent-stdin-closed')
})
