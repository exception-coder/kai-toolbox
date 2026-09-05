import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Layers3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { guideSections } from '../guide/delegationContent'
import { ResponsibilityComparison, ResponsibilityDiagram } from '../guide/ResponsibilityDiagram'
import { ProtocolWalkthrough } from '../guide/ProtocolWalkthrough'
import { QuickStart } from '../guide/QuickStart'
import { ProtocolReference, RecoveryReference } from '../guide/ProtocolReference'
import '../showcase.css'
import '../guide/guide.css'

function GuideSection({ id, title, number, children }: { id: string; title: string; number: string; children: ReactNode }) {
  return <section id={id} className="guide-section" aria-labelledby={`${id}-heading`}><div className="guide-section-title"><span>{number}</span><h2 id={`${id}-heading`}>{title}</h2></div>{children}</section>
}

export default function DelegationGuidePage() {
  return (
    <div className="forge-explore delegation-guide">
      <a className="explore-skip" href="#guide-main">跳到说明书正文</a>
      <header className="explore-nav"><Link to="/explore" className="explore-brand"><Layers3 size={22} /><span>Forge</span><span className="explore-brand-caption">能力说明书</span></Link><Link to="/explore" className="explore-workspace"><ArrowLeft size={16} />返回能力展厅</Link></header>
      <div className="guide-masthead"><p className="explore-eyebrow">CAPABILITY MANUAL / 01 · SESSION DELEGATION</p><h1>委托，让业务走进研发现场。</h1><p>一条已有会话，一份明确授权。参与者直接提出需求、澄清问题、看到进展；所有者掌握执行边界与关键决策。</p><div className="guide-masthead-bottom"><span>协议 1.0 · SDK @kai/session-client</span><a href="#quickstart">从快速接入开始<ArrowRight size={16} /></a></div></div>
      <div className="guide-layout">
        <nav className="guide-toc" aria-label="说明书目录"><p>本页内容</p>{guideSections.map(([id, name], index) => <a key={id} href={`#${id}`}><span>0{index + 1}</span>{name}</a>)}</nav>
        <main id="guide-main">
          <GuideSection id="overview" title="能力全景" number="01"><ResponsibilityDiagram /><p className="guide-note">委托限定谁能做什么；OpenSpec 自动监督决定任务如何继续推进。两者可以组合使用。</p><div className="guide-actions"><Link to="/explore/vibe-coding">了解 Vibe Coding 自动监督与权限执行原理<ArrowRight size={16} /></Link></div></GuideSection>
          <GuideSection id="responsibilities" title="服务端守住边界，客户端连接业务。" number="02"><ResponsibilityComparison /></GuideSection>
          <GuideSection id="protocol" title="一条委托，如何真正运转？" number="03"><ProtocolWalkthrough /></GuideSection>
          <GuideSection id="quickstart" title="选择适合你的接入方式。" number="04"><QuickStart /></GuideSection>
          <GuideSection id="reference" title="接口与事件，按需查阅。" number="05"><ProtocolReference /></GuideSection>
          <GuideSection id="recovery" title="遇到边界，也有下一步。" number="06"><RecoveryReference /></GuideSection>
          <div className="guide-end"><Link to="/explore"><ArrowLeft size={16} />继续探索能力</Link><a href="#quickstart">回到接入步骤<ArrowRight size={16} /></a></div>
        </main>
      </div>
    </div>
  )
}
