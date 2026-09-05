import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { protocolScenarios } from './delegationContent'

export function ProtocolWalkthrough() {
  const [selected, setSelected] = useState(protocolScenarios[0].id)
  const scenario = protocolScenarios.find(item => item.id === selected)!
  return (
    <div>
      <div className="guide-switcher" role="group" aria-label="实现原理场景">
        {protocolScenarios.map(item => <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{item.name}</button>)}
      </div>
      <figure className="guide-sequence" aria-label={`${scenario.name}时序图`}>
        <figcaption>{scenario.summary}</figcaption>
        <ol>{scenario.steps.map((step, index) => <li key={`${scenario.id}-${step.label}`}><span className="guide-step-number">{String(index + 1).padStart(2, '0')}</span><div className="guide-sequence-actors"><span>{step.from}</span><ArrowRight size={16} /><span>{step.to}</span></div><div className="guide-step-content"><h3>{step.label}</h3><p>{step.detail}</p></div></li>)}</ol>
      </figure>
      <p className="guide-note">这是协议说明图，不代表正在运行的会话或真实执行进度。</p>
    </div>
  )
}
