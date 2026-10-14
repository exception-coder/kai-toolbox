import { useId, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { replyPreview, replySections } from '../../lib/replyPreview'
import { Markdown } from '../Markdown'

/** 手机长回复按原文分层，正在输出和短回复始终完整展示。 */
export function AssistantReply({ text, sessionId, compact, streaming, layered }: {
  text: string; sessionId?: string; compact?: boolean; streaming?: boolean; layered?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const parts = useMemo(() => compact && !streaming ? replyPreview(text) : null, [text, compact, streaming])
  if (!parts) return <ReplyContent text={text} sessionId={sessionId} layered={layered && !streaming} />
  return <div className="cc-reply-content">
    <div className="cc-reply-overview"><ReplyContent text={parts.preview} sessionId={sessionId} layered={layered} /></div>
    <button type="button" aria-expanded={expanded} aria-controls={detailsId}
      onClick={() => setExpanded(value => !value)} className="cc-reply-disclosure">
      {expanded ? '收起回复详情' : '查看回复详情'}
      <ChevronDown aria-hidden="true" className={expanded ? 'size-3.5 rotate-180' : 'size-3.5'} />
    </button>
    <div id={detailsId} hidden={!expanded}>
      {expanded && <ReplyContent text={parts.details} sessionId={sessionId} layered={layered} />}
    </div>
  </div>
}

function ReplyContent({ text, sessionId, layered }: { text: string; sessionId?: string; layered?: boolean }) {
  const sections = useMemo(() => layered ? replySections(text) : null, [text, layered])
  if (!sections || sections.length < 2) return <Markdown text={text} className="min-w-0" sessionId={sessionId} />
  return <div className="cc-reply-sections">{sections.filter(section => section.raw.trim()).map((section, index) =>
    <section key={index} className={`cc-reply-section cc-reply-section--${section.kind}`}>
      <Markdown text={section.raw} className="min-w-0" sessionId={sessionId} />
    </section>,
  )}</div>
}
