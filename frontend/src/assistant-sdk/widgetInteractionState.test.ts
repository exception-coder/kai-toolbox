import { describe, expect, it } from 'vitest'

import { deriveWidgetInteractionState } from './widgetInteractionState'

describe('deriveWidgetInteractionState', () => {
  it.each([
    '正在准备上下文', '正在连接', '正在载入页面会话', '正在重连', '回复中',
    '消息处理中', '后台处理中', '消息待发送', '等待确认',
  ])('locks sending while state is %s', state => {
    const interaction = deriveWidgetInteractionState(state)

    expect(interaction.busy).toBe(true)
    expect(interaction.activityVisible).toBe(true)
  })

  it('presents page session matching as a calm connection state', () => {
    const interaction = deriveWidgetInteractionState('正在载入页面会话')

    expect(interaction.activityLabel).toBe('正在连接当前页面会话…')
    expect(interaction.tone).toBe('active')
  })

  it.each(['已就绪', '已恢复', '已完成'])('hides idle state %s from the message feed', state => {
    const interaction = deriveWidgetInteractionState(state)

    expect(interaction.busy).toBe(false)
    expect(interaction.activityVisible).toBe(false)
  })

  it('keeps failures visible without blocking a retry', () => {
    const interaction = deriveWidgetInteractionState('准备失败')

    expect(interaction.busy).toBe(false)
    expect(interaction.activityVisible).toBe(true)
    expect(interaction.tone).toBe('error')
  })
})
