import { ArrowDown, ArrowRight, Check, MessageSquare, Orbit } from 'lucide-react'

export function CapabilityVisual({ kind }: { kind: string }) {
  if (kind === 'rainbow') {
    return (
      <div className="explore-visual explore-visual-rainbow" aria-hidden="true">
        <div className="explore-context"><span>你正在使用的业务页面</span><span className="explore-context-lines"><i /><i /><i /></span></div>
        <div className="explore-capsule"><span className="explore-spectrum"><i /><i /><i /><i /></span><MessageSquare size={16} /> 这个问题，交给 Forge</div>
        <div className="explore-visual-output"><span>页面上下文</span><span>你的问题</span><ArrowRight size={16} /><strong>同一个现场</strong></div>
      </div>
    )
  }
  return (
    <div className="explore-visual explore-visual-delegation" aria-hidden="true">
      <div className="explore-handoff"><span>参与者 · 提出需求</span><span className="explore-connector" /><Orbit size={20} /><strong>Forge</strong></div>
      <div className="explore-execution"><ArrowDown size={16} /><span>受约束执行</span><ArrowRight size={16} /><span>反馈进展</span></div>
      <div className="explore-return"><Check size={16} /><span>所有者保留配置、审批与撤销权。</span></div>
    </div>
  )
}
