import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CODEX_HTTPS_PROVIDER, CODEX_WS_CONTEXT_BUDGET_BYTES, selectCodexTransport } from '../codexTransportPolicy.js'
import { createCodexSdkFallbackClient } from './codexSdkTransport.js'

test('real SDK exec receives HTTPS on consecutive fallback clients without leaking it into another session', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'forge-sdk-transport-'))
  const previousDirectory = process.cwd()
  process.chdir(directory)
  t.after(async () => { process.chdir(previousDirectory); await rm(directory, { recursive: true, force: true }) })
  // Node acts as a local exec peer and reports only parsed config flags; no model or account calls.
  await writeFile(join(directory, 'exec'), `
    const args = process.argv.slice(2);
    const config = args.flatMap((arg,index) => arg === '--config' ? [args[index+1]] : []);
    const send = event => process.stdout.write(JSON.stringify(event)+'\\n');
    process.stdin.resume();
    process.stdin.on('end', () => {
      send({type:'thread.started',thread_id:'fixture-thread'});
      send({type:'item.completed',item:{id:'config',type:'agent_message',text:JSON.stringify(config)}});
      send({type:'turn.completed',usage:{input_tokens:0,output_tokens:0,cached_input_tokens:0}});
    });
  `)
  const baseConfig = { 'mcp_servers.forge.enabled': false, developer_instructions: 'current constraints' }
  const large = await selectCodexTransport({ cwd: directory,
    config: { ...baseConfig, developer_instructions: 'old constraints', 'mcp_servers.forge.enabled': true },
    input: [{ type: 'text', text: 'x'.repeat(CODEX_WS_CONTEXT_BUDGET_BYTES) }] },
  async () => ({ config: { model_provider: 'openai' } }))
  const small = await selectCodexTransport({ cwd: directory, input: [{ type: 'text', text: 'small' }] },
    async () => ({ config: { model_provider: 'openai' } }))
  for (const selection of [large, large, small, { ...small, modelProvider: 'openai' }]) {
    const client = createCodexSdkFallbackClient({ codexPathOverride: process.execPath, config: baseConfig,
      env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), NODE_OPTIONS: '' } }, selection)
    const { events } = await client.startThread({ workingDirectory: directory, skipGitRepoCheck: true }).runStreamed('fixture only')
    let config: string[] | undefined
    let completed = false
    for await (const event of events) {
      if (event.type === 'item.completed' && event.item.type === 'agent_message') config = JSON.parse(event.item.text)
      if (event.type === 'turn.completed') completed = true
    }
    assert.equal(completed, true)
    assert.ok(config?.some(value => value.includes('mcp_servers.forge.enabled=false')))
    assert.ok(config?.some(value => value.includes('current constraints')))
    assert.ok(config?.every(value => !value.includes('old constraints')))
    if (selection === large) {
      assert.ok(config?.some(value => value.includes(`model_provider="${CODEX_HTTPS_PROVIDER}"`)))
      assert.ok(config?.some(value => value.includes('supports_websockets=false')))
    } else {
      assert.ok(config?.every(value => !value.includes(CODEX_HTTPS_PROVIDER)))
      if (selection.modelProvider === 'openai') assert.ok(config?.includes('model_provider="openai"'))
    }
  }
})
