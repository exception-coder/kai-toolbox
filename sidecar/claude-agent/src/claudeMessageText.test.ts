import assert from 'node:assert/strict'
import test from 'node:test'
import { ClaudeMessageText } from './claudeMessageText.js'

const delta = (text: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } })
const complete = (uuid: string, text: string) => ({ type: 'assistant', uuid, message: { content: [{ type: 'text', text }] } })

test('complete Claude replies are delivered when partial text is absent', () => {
  const text = new ClaudeMessageText()
  assert.equal(text.accept(complete('one', '正在检查。')), '正在检查。')
  assert.equal(text.accept({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read' }] } }), undefined)
  assert.equal(text.accept(complete('two', '检查完成。')), '检查完成。')
  assert.equal(text.accept(complete('two', '检查完成。')), undefined)
})

test('partial text followed by its complete block is not duplicated', () => {
  const text = new ClaudeMessageText()
  assert.equal(text.accept(delta('hello ')), 'hello ')
  assert.equal(text.accept(delta('world')), 'world')
  assert.equal(text.accept(complete('one', 'hello world')), undefined)
  assert.equal(text.accept(complete('one', 'hello world')), undefined)
})

test('a complete block supplies the missing streamed suffix', () => {
  const text = new ClaudeMessageText()
  assert.equal(text.accept(delta('检查')), '检查')
  assert.equal(text.accept(complete('one', '检查完成。')), '完成。')
})

test('complete blocks reconcile independently within one streamed response', () => {
  const text = new ClaudeMessageText()
  text.accept(delta('第一段'))
  text.accept(delta('第二段'))
  assert.equal(text.accept(complete('one', '第一段')), undefined)
  assert.equal(text.accept(complete('two', '第二段')), undefined)
  text.accept({ type: 'stream_event', event: { type: 'message_start' } })
  assert.equal(text.accept(complete('three', '工具后的回答')), '工具后的回答')
})
