import { ArrowDown, ArrowRight, Layers3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { featuredCapabilities } from '../capabilities'
import { CapabilityDetail } from '../components/CapabilityDetail'
import { CapabilityExplorer } from '../components/CapabilityExplorer'
import { CapabilityVisual } from '../components/CapabilityVisual'
import '../showcase.css'

function FeaturedCapabilities() {
  return (
    <section aria-labelledby="featured-heading" className="explore-featured-section">
      <div className="explore-featured-heading"><h2 id="featured-heading">两种方式，让工作向前。</h2><span>FORGE / 精选能力</span></div>
      <div className="explore-featured-grid">
        {featuredCapabilities.map((capability, index) => (
          <CapabilityDetail key={capability.id} capability={capability}>
            <button type="button" className={`explore-featured explore-featured-${capability.id}`} aria-label={`了解${capability.name}`}>
              <span className="explore-featured-label"><span>0{index + 1} / {capability.name}</span><ArrowRight size={18} /></span>
              <h3>{capability.promise}</h3>
              <p>{capability.description}</p>
              <CapabilityVisual kind={capability.id} />
              <span className="explore-featured-link">认识{capability.name}<ArrowRight size={16} /></span>
            </button>
          </CapabilityDetail>
        ))}
      </div>
    </section>
  )
}

export default function ExplorePage() {
  return (
    <div className="forge-explore">
      <a className="explore-skip" href="#explore-main">跳到主要内容</a>
      <header className="explore-nav">
        <Link to="/" className="explore-brand" aria-label="Forge 工作台"><Layers3 size={22} /><span>Forge</span><span className="explore-brand-caption">能力展厅</span></Link>
        <Link to="/" className="explore-workspace">进入工作台<ArrowRight size={16} /></Link>
      </header>
      <main id="explore-main" className="explore-main">
        <section className="explore-hero" aria-labelledby="explore-title">
          <div><p className="explore-eyebrow">探索 FORGE · 从想法到成果</p><h1 id="explore-title">把复杂的研发工作，<br /><span>交给 Forge 一起完成。</span></h1></div>
          <div className="explore-hero-aside"><p>接住业务现场的一个问题，<br />理清需求，推进开发，复核结果。<br />让每一步工作，都有下一步。</p><a href="#capabilities">探索全部能力<ArrowDown size={16} /></a></div>
        </section>
        <FeaturedCapabilities />
        <CapabilityExplorer />
        <section className="explore-closing"><div><p className="explore-eyebrow">从你的工作开始</p><h2>下一个想法，不必独自完成。</h2></div><Link to="/">打开 Forge 工作台<ArrowRight size={18} /></Link></section>
      </main>
      <footer className="explore-footer"><span>Forge</span><span>连接业务现场与研发行动。</span><a href="#explore-title">回到顶部 ↑</a></footer>
    </div>
  )
}
