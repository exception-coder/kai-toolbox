import type { StatusTone } from '@/components/ui/status-badge'
import type { Engine } from '../types'

/** 连接态中文文案，供单会话页与分屏块共用。 */
export function stateLabel(s: string): string {
  switch (s) {
    case 'connecting': return '连接中…'
    case 'ready': return '已连接'
    case 'closed': return '已断开（重连中）'
    case 'error': return '连接出错'
    default: return ''
  }
}

/** 连接态对应的状态徽标色调。 */
export function stateTone(s: string): StatusTone {
  switch (s) {
    case 'connecting': return 'info'
    case 'ready': return 'success'
    case 'closed': return 'warning'
    case 'error': return 'danger'
    default: return 'neutral'
  }
}

/** 引擎显示名。 */
export function engineName(e: Engine): string {
  return e === 'codex' ? 'Codex' : e === 'gemini' ? 'Gemini' : 'Claude'
}
