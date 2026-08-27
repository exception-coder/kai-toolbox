import type { SchedulerTask } from './types'

type Schedule = Pick<SchedulerTask, 'scheduleType' | 'scheduleExpression'>

export function describeSchedule(schedule: Schedule) {
  const duration = formatDuration(schedule.scheduleExpression)
  if (schedule.scheduleType === 'FIXED_RATE') {
    return duration ? `每 ${duration} 执行一次` : '按固定频率执行'
  }
  if (schedule.scheduleType === 'FIXED_DELAY') {
    return duration ? `上次执行结束后 ${duration} 再执行` : '按固定延迟执行'
  }
  if (schedule.scheduleType === 'CRON') {
    return describeCron(schedule.scheduleExpression)
  }
  return '按自定义计划执行'
}

export function technicalSchedule(schedule: Schedule) {
  const type = {
    CRON: 'Cron',
    FIXED_RATE: '固定频率',
    FIXED_DELAY: '固定延迟',
    CUSTOM: '自定义',
  }[schedule.scheduleType]
  return schedule.scheduleExpression ? `${type} · ${schedule.scheduleExpression}` : type
}

function describeCron(expression: string) {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 6) return '按 Cron 计划执行'
  const [second, minute, hour, day, month, weekday] = fields
  if (isEvery(second) && areAll(minute, hour, day, month, weekday)) {
    return `每 ${intervalOf(second)} 秒执行一次`
  }
  if (second === '0' && isEvery(minute) && areAll(hour, day, month, weekday)) {
    return `每 ${intervalOf(minute)} 分钟执行一次`
  }
  if (second === '0' && minute === '0' && isEvery(hour) && areAll(day, month, weekday)) {
    return `每 ${intervalOf(hour)} 小时执行一次`
  }
  if (second === '0' && isInteger(minute) && isInteger(hour) && areAll(day, month, weekday)) {
    return `每天 ${hour.padStart(2, '0')}:${minute.padStart(2, '0')} 执行`
  }
  return '按 Cron 计划执行'
}

function formatDuration(value: string) {
  const raw = value.trim()
  if (!raw) return null
  if (/^\d+(?:\.\d+)?$/.test(raw)) return formatMilliseconds(Number(raw))

  const simple = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i)
  if (simple) return `${trimNumber(Number(simple[1]))} ${unitName(simple[2].toLowerCase())}`

  const iso = raw.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i)
  if (!iso) return null
  const parts = [
    [iso[1], '天'],
    [iso[2], '小时'],
    [iso[3], '分钟'],
    [iso[4], '秒'],
  ].filter(([amount]) => amount != null).map(([amount, unit]) => `${trimNumber(Number(amount))} ${unit}`)
  return parts.length > 0 ? parts.join(' ') : null
}

function formatMilliseconds(value: number) {
  if (value < 1000) return `${trimNumber(value)} 毫秒`
  if (value % 3_600_000 === 0) return `${trimNumber(value / 3_600_000)} 小时`
  if (value % 60_000 === 0) return `${trimNumber(value / 60_000)} 分钟`
  return `${trimNumber(value / 1000)} 秒`
}

function isEvery(value: string) {
  return /^\*\/\d+$/.test(value)
}

function intervalOf(value: string) {
  return value.slice(2)
}

function areAll(...values: string[]) {
  return values.every((value) => value === '*')
}

function isInteger(value: string) {
  return /^\d+$/.test(value)
}

function trimNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)))
}

function unitName(unit: string) {
  return { ms: '毫秒', s: '秒', m: '分钟', h: '小时', d: '天' }[unit]
}
