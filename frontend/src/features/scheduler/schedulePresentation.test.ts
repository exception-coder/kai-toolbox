import { describe, expect, it } from 'vitest'
import { describeSchedule, technicalSchedule } from './schedulePresentation'

describe('describeSchedule', () => {
  it('translates common Spring cron intervals and daily schedules', () => {
    expect(describeSchedule({ scheduleType: 'CRON', scheduleExpression: '0 */2 * * * *' }))
      .toBe('每 2 分钟执行一次')
    expect(describeSchedule({ scheduleType: 'CRON', scheduleExpression: '0 30 2 * * *' }))
      .toBe('每天 02:30 执行')
  })

  it('preserves fixed delay and fixed rate semantics', () => {
    expect(describeSchedule({ scheduleType: 'FIXED_DELAY', scheduleExpression: 'PT0.5S' }))
      .toBe('上次执行结束后 0.5 秒 再执行')
    expect(describeSchedule({ scheduleType: 'FIXED_RATE', scheduleExpression: 'PT2H' }))
      .toBe('每 2 小时 执行一次')
    expect(describeSchedule({ scheduleType: 'FIXED_DELAY', scheduleExpression: '500' }))
      .toBe('上次执行结束后 500 毫秒 再执行')
  })

  it('keeps the raw expression available as secondary technical context', () => {
    expect(technicalSchedule({ scheduleType: 'CRON', scheduleExpression: '0 */10 * * * *' }))
      .toBe('Cron · 0 */10 * * * *')
  })
})
