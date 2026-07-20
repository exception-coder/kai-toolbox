import type { Slide } from '../slidesContent'

/** 每页仅承载一个论点：一个 <section> 对应一个 Slide，class 标注母版类型供 CSS 命中。 */
export function SlideSection({ slide }: { slide: Slide }) {
  switch (slide.kind) {
    case 'cover':
      return (
        <section className="master-cover">
          <div className="eyebrow">{slide.eyebrow}</div>
          <h1>{slide.title}</h1>
          <p className="subtitle">{slide.subtitle}</p>
        </section>
      )

    case 'opening':
      return (
        <section className="master-content-single">
          <h2>{slide.heading}</h2>
          <ul>
            {slide.painPoints.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p>
            <strong>{slide.thesis}</strong>
          </p>
        </section>
      )

    case 'architecture':
      return (
        <section className="master-content-single">
          <h2>{slide.heading}</h2>
          <p>{slide.intro}</p>
          <ul>
            {slide.layers.map((l) => (
              <li key={l.key}>
                <strong>{l.label}</strong>：{l.detail} —— {l.solves}
              </li>
            ))}
          </ul>
          <p className="caption">{slide.principle}</p>
        </section>
      )

    case 'case-study':
      return (
        <section className="master-content-dual">
          <h2>{slide.heading}</h2>
          <div className="columns">
            <div className="col">
              <h3>{slide.multiEngine.title}</h3>
              <ul>
                {slide.multiEngine.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <div className="col">
              <h3>{slide.lifecycle.title}</h3>
              <p>{slide.lifecycle.states.join(' → ')}</p>
              <p>{slide.lifecycle.highlight}</p>
            </div>
          </div>
          <p className="provenance-note">{slide.provenanceNote}</p>
        </section>
      )

    case 'closed-loop':
      return (
        <section className="master-content-single">
          <h2>{slide.heading}</h2>
          <p className="caption">本轮澄清议题：{slide.clarificationTopics.join('；')}</p>
          <ul>
            {slide.stages.map((s) => (
              <li key={s.key}>
                <strong>
                  {s.label}
                  {s.status === 'planned' ? '（尚未发生）' : ''}
                </strong>
                ：{s.detail}
              </li>
            ))}
          </ul>
          <p className="provenance-note">{slide.dataSourceDisclaimer}</p>
        </section>
      )

    case 'quant':
      return (
        <section className="master-content-dual">
          <h2>{slide.heading}</h2>
          <div className="columns">
            <div className="col">
              {slide.stats.map((s) => (
                <div className="stat-tile" key={s.label} style={{ marginBottom: 12 }}>
                  <div className="stat-value">
                    {s.value}
                    <span style={{ fontSize: '0.5em' }}>{s.unit}</span>
                  </div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="col">
              <ul>
                {slide.insights.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="provenance-note">{slide.disclaimer}</p>
        </section>
      )

    case 'adoption':
      return (
        <section className="master-summary">
          <h2>{slide.heading}</h2>
          <ul>
            {slide.onboardingSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p>{slide.valueProps.join(' · ')}</p>
          <p className="caption">{slide.roadmapTeaser}</p>
        </section>
      )
  }
}
