export type ExecutionView = {
  id: string | null
  taskId: string
  triggerSource: 'SCHEDULED' | 'MANUAL'
  status: string
  startTime: string
  endTime: string | null
  durationMs: number | null
  errorSummary: string | null
}

export type SchedulerTask = {
  id: string
  name: string
  description: string
  owner: string
  source: 'MANAGED' | 'SPRING'
  scheduleType: 'CRON' | 'FIXED_RATE' | 'FIXED_DELAY' | 'CUSTOM'
  scheduleExpression: string
  zone: string
  enabled: boolean
  controllable: boolean
  running: boolean
  nextExecution: string | null
  lastExecution: ExecutionView | null
}
