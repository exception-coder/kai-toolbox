import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Writable } from 'node:stream'
import { setImmediate } from 'node:timers/promises'
import { jsonLineWriter } from './jsonLineWriter.js'

test('asynchronous broken pipe settles owner once, including duplicate error event', async () => {
  const errors: Error[] = []
  const stream = new Writable({ write(_chunk, _encoding, callback) {
    queueMicrotask(() => callback(new Error('EPIPE')))
  } })
  jsonLineWriter(stream, error => errors.push(error), () => false)({ id: 1 })
  await setImmediate()
  assert.equal(errors.length, 1)
  assert.equal(errors[0].message, 'EPIPE')
})

test('ended stream fails immediately without writing after end', () => {
  const errors: Error[] = []
  const stream = new Writable({ write(_chunk, _encoding, callback) { callback() } })
  stream.end()
  jsonLineWriter(stream, error => errors.push(error), () => false)({ id: 1 })
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /stdin 已关闭/)
})

test('late shutdown error is consumed without changing a completed result', () => {
  let writes = 0
  const stream = new Writable({ write(_chunk, _encoding, callback) { writes++; callback() } })
  const send = jsonLineWriter(stream, () => assert.fail('completed owner must stay completed'), () => true)
  send({ id: 1 })
  stream.emit('error', new Error('late EPIPE'))
  assert.equal(writes, 0)
})

test('normal RPC payload remains one JSON line', () => {
  let payload = ''
  const stream = new Writable({ write(chunk, _encoding, callback) { payload += String(chunk); callback() } })
  jsonLineWriter(stream, () => assert.fail('unexpected failure'), () => false)({ id: 1, method: 'initialize' })
  assert.equal(payload, '{"id":1,"method":"initialize"}\n')
})
