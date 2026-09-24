import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { claudeGatewayUserCapabilities, claudeSettingSources } from './claudeGatewaySettings.js'

test('only third-party Claude sessions isolate user settings; official sessions keep SDK defaults', () => {
  assert.deepEqual(claudeSettingSources('https://api.deepseek.com/v1'), ['project', 'local'])
  assert.deepEqual(claudeSettingSources('https://gateway.example/v1'), ['project', 'local'])
  assert.equal(claudeSettingSources(undefined), undefined)
})

test('gateway capabilities inherit only enabled user plugins and personal MCP', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-gateway-settings-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  const plugin = path.join(home, 'plugin')
  fs.mkdirSync(path.join(home, '.claude', 'plugins'), { recursive: true })
  fs.mkdirSync(plugin)
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({
    env: { ANTHROPIC_BASE_URL: 'https://4sapi.example', ANTHROPIC_AUTH_TOKEN: 'wrong' },
    model: 'wrong-model', enabledPlugins: { 'enabled@user': true, 'disabled@user': false },
  }))
  fs.writeFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({
    plugins: { 'enabled@user': [{ scope: 'user', installPath: plugin }] },
  }))
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: {
    personal: { command: 'node', args: ['server.js'], env: { TOKEN: 'private' } },
    off: { command: 'node', disabled: true },
  } }))
  const capabilities = claudeGatewayUserCapabilities(home)
  assert.deepEqual(capabilities.plugins, [{ type: 'local', path: fs.realpathSync(plugin) }])
  assert.deepEqual(Object.keys(capabilities.mcpServers ?? {}), ['personal'])
  assert.equal(capabilities.mcpServers?.personal && 'env' in capabilities.mcpServers.personal
    ? capabilities.mcpServers.personal.env?.TOKEN : undefined, 'private')
  assert.equal(JSON.stringify(capabilities).includes('4sapi.example'), false)
  assert.equal(JSON.stringify(capabilities).includes('wrong-model'), false)
})

test('invalid enabled plugin and MCP give recoverable errors', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-gateway-invalid-'))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { missing: true } }))
  assert.throws(() => claudeGatewayUserCapabilities(home), /CLAUDE_PLUGIN_UNAVAILABLE/)
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{}')
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { broken: { type: 'stdio' } } }))
  assert.throws(() => claudeGatewayUserCapabilities(home), /CLAUDE_MCP_INVALID/)
})
