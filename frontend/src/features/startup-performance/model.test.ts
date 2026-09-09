import { describe, expect, it } from 'vitest'
import { formatMs, parseReport } from './model'

describe('startup measurement reports', () => {
  it('preserves automatic build attribution through export and import', () => {
    const observation = { status: 'PENDING', elapsedMs: null, source: null }
    const build = { status: 'COMPLETED', scope: 'maven-before-jvm', durationMs: 12345, exitCode: null }
    const snapshot = {
      runId: 'supervised', processId: 123, jvmStartedAtEpochMs: 100000,
      clock: 'JVM_UPTIME_MS', toolCoverage: 'PARTIAL', build,
      milestones: Object.fromEntries(['mainEntered', 'springInvoked', 'contextRefreshed',
        'applicationReady', 'firstApiSuccess'].map(name => [name, observation])),
      tools: {}, stepCapacity: 2048, capturedStepCount: 0,
      stepsPossiblyTruncated: false, slowestSteps: [],
    }
    const report = parseReport(snapshot)
    expect(report.build).toEqual(build)
    expect(parseReport(JSON.parse(JSON.stringify(report))).build).toEqual(build)
    expect(parseReport({ ...snapshot, build: undefined }).build.status).toBe('NOT_MEASURED')
  })

  it('preserves failed build without inventing runtime data', () => {
    const result = parseReport({
      schemaVersion: 1, runId: 'failure', status: 'FAILED',
      build: { status: 'FAILED', durationMs: 1234, exitCode: 17 },
      runtime: null, error: 'Build failed',
    })
    expect(result.runtime).toBeNull()
    expect(result.build.exitCode).toBe(17)
  })

  it('rejects invalid reports and negative build duration', () => {
    expect(() => parseReport({ runId: 'wrong' })).toThrow('报告格式不匹配')
    expect(() => parseReport({
      schemaVersion: 1, runId: 'invalid', status: 'FAILED',
      build: { status: 'FAILED', durationMs: -1, exitCode: 1 }, runtime: null, error: null,
    })).toThrow()
  })

  it('keeps unknown and measured zero distinct', () => {
    expect(formatMs(null)).toBe('—')
    expect(formatMs(0)).toBe('0.0 ms')
    expect(formatMs(1234)).toBe('1.23 s')
  })
})
