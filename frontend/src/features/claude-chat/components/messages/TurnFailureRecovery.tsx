import type { ChatItem } from '../../types'
import { resultFailure } from '../../lib/turnFailure'

export interface TurnRecoveryActions {
  onDraft: (text: string) => void
  onContinue?: () => void
  onConfigure?: () => void
  onNewSession?: () => void
  canContinue: boolean
  canCompact: boolean
}

const RECOVERY_HINTS = {
  quota: '当前额度或请求频率受限。可稍后重试，或检查账号与模型配置。',
  context: '本轮上下文已超过模型限制。可准备压缩指令，或在同目录新建会话。',
  authentication: '请检查当前引擎的登录状态或服务商凭据，恢复授权后再发送。',
  network: '本轮因服务或连接问题结束。重试前先核对已执行的操作，避免重复写入。',
  request: '请展开详情检查错误，调整请求或工具配置后再发送。',
  refusal: '引擎拒绝了当前请求，请调整需求后重新发送。',
  limit: '本轮已达到执行次数或输出上限。核对当前进度后可以继续。',
  incomplete: '尚未确认原任务全部完成。可继续核对剩余工作，待发送队列保持原状态。',
  unknown: '当前记录没有足够的失败分类证据，请先查看详情再决定如何继续。',
}

export function TurnFailureRecovery({ item, actions }: {
  item: Extract<ChatItem, { kind: 'result' }>; actions: TurnRecoveryActions
}) {
  const failure = resultFailure(item)
  if (!failure) return null
  const button = 'min-h-11 rounded-md px-2 text-xs underline underline-offset-4 hover:bg-[var(--color-muted)] disabled:opacity-50'
  return <div className="max-w-full py-1 text-xs text-[var(--color-muted-foreground)]" role="status">
    <p className="break-words leading-relaxed">{RECOVERY_HINTS[failure.category]}</p>
    <div className="flex flex-wrap gap-x-2">
      {['quota', 'authentication', 'request'].includes(failure.category) && actions.onConfigure
        && <button type="button" className={button} onClick={actions.onConfigure}>检查会话配置</button>}
      {failure.category === 'context' && <>
        {actions.canCompact && <button type="button" className={button} onClick={() => actions.onDraft('/compact ')}>准备压缩指令</button>}
        {actions.onNewSession && <button type="button" className={button} onClick={actions.onNewSession}>新建会话（同目录）</button>}
      </>}
      {['network', 'quota', 'unknown'].includes(failure.category) && <button type="button" className={button}
        onClick={() => actions.onDraft('请先核对上一轮实际执行到了哪一步及已产生的结果，再处理未完成部分；不要重复已经成功的操作，保持原权限边界。')}>准备核对与重试</button>}
      {['request', 'refusal'].includes(failure.category) && <button type="button" className={button}
        onClick={() => actions.onDraft('请结合上一轮的错误，先说明需要调整的请求或配置；保持原权限边界。')}>调整需求</button>}
      {['limit', 'incomplete'].includes(failure.category) && actions.onContinue
        && <button type="button" className={button} disabled={!actions.canContinue}
          onClick={actions.onContinue}>继续处理</button>}
    </div>
  </div>
}
