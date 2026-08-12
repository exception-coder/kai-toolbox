import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeLogEndpoint, normalizeTraceEndpoint } from './telemetry.js'

test('normalizes independent OTLP trace and log endpoints', () => {
  assert.equal(normalizeTraceEndpoint('http://127.0.0.1:4318'), 'http://127.0.0.1:4318/v1/traces')
  assert.equal(normalizeLogEndpoint('http://127.0.0.1:4318/v1/traces'), 'http://127.0.0.1:4318/v1/logs')
  assert.equal(normalizeTraceEndpoint('http://127.0.0.1:4318/v1/logs'), 'http://127.0.0.1:4318/v1/traces')
})
