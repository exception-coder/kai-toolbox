import assert from 'node:assert/strict'
import test from 'node:test'
import { claudeGatewayBaseUrl, claudeGatewayEnvironment, isOfficialDeepSeekGateway, verifiableResponseModel } from './claudeGatewayRouting.js'

test('Claude routes official DeepSeek profiles through its Anthropic-compatible endpoint', () => {
  assert.equal(claudeGatewayBaseUrl('https://api.deepseek.com'), 'https://api.deepseek.com/anthropic')
  assert.equal(claudeGatewayBaseUrl('https://api.deepseek.com/v1'), 'https://api.deepseek.com/anthropic')
  assert.equal(claudeGatewayBaseUrl('https://api.deepseek.com/anthropic'), 'https://api.deepseek.com/anthropic')
  assert.equal(claudeGatewayBaseUrl('http://api.deepseek.com'), 'https://api.deepseek.com/anthropic')
  assert.equal(isOfficialDeepSeekGateway('https://api.deepseek.com'), true)
  const env = claudeGatewayEnvironment('https://api.deepseek.com', 'test-key', 'deepseek-flash', {
    ANTHROPIC_API_KEY: 'stale-key', ANTHROPIC_MODEL: 'stale-model',
  })
  assert.equal(env.ANTHROPIC_BASE_URL, 'https://api.deepseek.com/anthropic')
  assert.equal(env.ANTHROPIC_API_KEY, undefined)
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'test-key')
  assert.equal(env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'deepseek-flash')
  assert.equal(env.CLAUDE_CODE_SUBAGENT_MODEL, 'deepseek-flash')
})

test('Claude leaves other provider URLs untouched', () => {
  assert.equal(claudeGatewayBaseUrl('https://4sapi.example'), 'https://4sapi.example')
  assert.equal(isOfficialDeepSeekGateway('https://deepseek.example'), false)
  assert.equal(isOfficialDeepSeekGateway('https://api.deepseek.com.evil.example'), false)
  assert.equal(claudeGatewayEnvironment('https://4sapi.example', 'test-key', undefined, {}).ANTHROPIC_API_KEY, 'test-key')
})

test('synthetic assistant model is not presented as an upstream response', () => {
  assert.equal(verifiableResponseModel('<synthetic>'), undefined)
  assert.equal(verifiableResponseModel('deepseek-flash'), 'deepseek-flash')
})
