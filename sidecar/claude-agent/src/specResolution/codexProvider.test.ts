import test from 'node:test'
import assert from 'node:assert/strict'
import { codexArguments, codexSchema } from './codexProvider.js'

test('Codex worker isolates configuration, stays ephemeral and disables execution surfaces', () => {
  const args = codexArguments('C:/temporary', 'schema.json', 'output.json')
  for (const option of ['--ephemeral', '--ignore-user-config', '--ignore-rules', 'read-only', 'project_doc_max_bytes=0', 'web_search="disabled"']) assert.ok(args.includes(option))
  for (const feature of ['shell_tool', 'apps', 'plugins', 'hooks', 'multi_agent', 'computer_use', 'code_mode_host']) {
    assert.equal(args[args.indexOf(feature) - 1], '--disable')
  }
})
test('Codex strict output schema requires optional keys as nullable without changing original schema', () => {
  const original = { type: 'object', properties: { required: { type: 'string' }, optional: { type: 'string' } }, required: ['required'] }
  const converted = codexSchema(original) as { required: string[]; properties: Record<string, unknown>; additionalProperties: boolean }
  assert.deepEqual(converted.required, ['required', 'optional'])
  assert.deepEqual(converted.properties.optional, { anyOf: [{ type: 'string' }, { type: 'null' }] })
  assert.equal(converted.additionalProperties, false); assert.deepEqual(original.required, ['required'])
})
