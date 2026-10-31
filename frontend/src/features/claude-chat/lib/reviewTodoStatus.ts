import type { ReviewTodoStatus } from '../api'

export const reviewTodoStatusLabel: Record<ReviewTodoStatus, string> = {
  WAITING: '待原会话确认', QUEUED: '待执行', RUNNING: '执行中', COMPLETED: '已完成', EXCEPTION: '异常待核对', SUPERSEDED: '已被新版替代或移除',
}
