import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { capabilities, categories, type Category } from '../capabilities'
import { CapabilityDetail } from './CapabilityDetail'

export function CapabilityExplorer() {
  const [category, setCategory] = useState<Category>('全部')
  const visible = capabilities.filter(capability => category === '全部' || capability.category === category)
  return (
    <section id="capabilities" className="explore-explorer" aria-labelledby="capabilities-heading">
      <div className="explore-section-heading"><div><p className="explore-eyebrow">继续探索</p><h2 id="capabilities-heading">找到你的下一步。</h2></div><p>从理解问题，到交付结果。</p></div>
      <div className="explore-filter-row">
        <div className="explore-filters" role="group" aria-label="能力分类">
          {categories.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
        </div>
        <span className="explore-count" aria-live="polite">{visible.length} 项能力</span>
      </div>
      <div className="explore-capability-grid">
        {visible.map(capability => {
          const Icon = capability.icon
          return (
            <CapabilityDetail key={capability.id} capability={capability}>
              <button type="button" className="explore-capability" aria-label={`了解${capability.name}`}>
                <span className="explore-capability-top"><Icon size={20} /><ArrowUpRight size={16} /></span>
                <h3>{capability.name}</h3><p>{capability.promise}</p>
                <span className="explore-capability-category">{capability.category}</span>
              </button>
            </CapabilityDetail>
          )
        })}
      </div>
    </section>
  )
}
