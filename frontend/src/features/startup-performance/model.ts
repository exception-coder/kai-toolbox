import { z } from 'zod'

const elapsed = z.number().finite().nonnegative().nullable()
const observation = z.object({
  status: z.enum(['COMPLETED', 'PENDING', 'FAILED', 'SKIPPED', 'NOT_OBSERVED']),
  elapsedMs: elapsed,
  source: z.string().max(512).nullable(),
})
export const snapshotSchema = z.object({
  build: z.object({
    status: z.enum(['COMPLETED', 'NOT_MEASURED']),
    scope: z.enum(['maven-package', 'maven-before-jvm', 'unknown']),
    durationMs: elapsed,
    exitCode: z.number().nullable(),
  }).optional(),
  runId: z.string().max(64),
  processId: z.number(),
  jvmStartedAtEpochMs: z.number(),
  clock: z.literal('JVM_UPTIME_MS'),
  toolCoverage: z.literal('PARTIAL'),
  milestones: z.object({
    mainEntered: observation, springInvoked: observation, contextRefreshed: observation,
    applicationReady: observation, firstApiSuccess: observation,
  }),
  tools: z.record(z.string().max(64), observation),
  stepCapacity: z.number(),
  capturedStepCount: z.number(),
  stepsPossiblyTruncated: z.boolean(),
  slowestSteps: z.array(z.object({
    id: z.number(), parentId: z.number().nullable(), name: z.string().max(256),
    durationMs: z.number().finite().nonnegative(), startOffsetMs: z.number(),
    tags: z.record(z.string().max(64), z.string().max(256)),
  })).max(100),
})
export const measurementSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().max(64),
  status: z.string().max(32),
  build: z.object({
    status: z.string().max(32), durationMs: elapsed, exitCode: z.number().nullable(),
    scope: z.enum(['maven-package', 'maven-before-jvm', 'unknown']).optional(),
  }),
  runtime: snapshotSchema.nullable(),
  error: z.string().max(4096).nullable(),
}).passthrough().refine(value => !value.runtime || value.runtime.runId === value.runId, '报告运行标识不一致')

export type StartupSnapshot = z.infer<typeof snapshotSchema>
export type MeasurementReport = z.infer<typeof measurementSchema>
export const MAX_REPORT_BYTES = 2 * 1024 * 1024
export function parseReport(value: unknown): MeasurementReport {
  const measurement = measurementSchema.safeParse(value)
  if (measurement.success) return measurement.data
  const snapshot = snapshotSchema.safeParse(value)
  if (snapshot.success) return {
    schemaVersion: 1, runId: snapshot.data.runId, status: 'COMPLETED',
    build: snapshot.data.build ?? { status: 'NOT_MEASURED', durationMs: null, exitCode: null },
    runtime: snapshot.data, error: null,
  }
  throw new Error('报告格式不匹配，请选择本页导出的 JSON 或测量命令生成的 report.json。')
}
export const statusLabels: Record<string, string> = {
  COMPLETED: '已观测', PENDING: '等待观测', FAILED: '失败', SKIPPED: '已跳过',
  NOT_OBSERVED: '未接入观测', NOT_MEASURED: '未测量', RUNNING: '进行中', TIMED_OUT: '超时',
}
export function formatMs(value: number | null | undefined) {
  if (value == null) return '—'
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value.toFixed(1)} ms`
}
export function exportReport(value: StartupSnapshot | MeasurementReport) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `startup-${value.runId.replace(/[^a-zA-Z0-9-]/g, '')}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
