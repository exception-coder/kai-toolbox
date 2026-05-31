// 时间轴贯穿简历模板
import type { ResumeData } from '../../types'
import { Avatar, BulletList, MetaInline } from './shared'

export function TimelineTemplate({ data }: { data: ResumeData }) {
  const { basics, work, projects, education, skills } = data
  return (
    <>
      <div className="r-header">
        <div className="r-avatar">
          <Avatar basics={basics} />
        </div>
        <div>
          <div className="r-name">{basics.name || '姓名'}</div>
          {basics.jobIntent && <div className="r-intent">求职意向 · {basics.jobIntent}</div>}
          <MetaInline basics={basics} />
        </div>
      </div>

      {basics.advantage && (
        <>
          <div className="r-section-title">个人优势</div>
          <div>{basics.advantage}</div>
        </>
      )}

      {work.length > 0 && (
        <>
          <div className="r-section-title">工作经历</div>
          <div className="r-timeline">
            {work.map(w => (
              <div key={w.id} className="r-item">
                <div className="r-item-period">{w.period}</div>
                <div>
                  <span className="r-item-title">{w.company}</span>
                  <span className="r-item-role">{w.role}</span>
                </div>
                {w.responsibilities.length > 0 && (
                  <>
                    <div className="r-sub">内容</div>
                    <BulletList items={w.responsibilities} />
                  </>
                )}
                {w.achievements.length > 0 && (
                  <>
                    <div className="r-sub">业绩</div>
                    <BulletList items={w.achievements} />
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {projects.length > 0 && (
        <>
          <div className="r-section-title">项目经历</div>
          <div className="r-timeline">
            {projects.map(p => (
              <div key={p.id} className="r-item">
                <div className="r-item-period">{p.period}</div>
                <div>
                  <span className="r-item-title">{p.name}</span>
                  <span className="r-item-role">{p.role}</span>
                </div>
                {p.description && <div style={{ marginBottom: 4 }}>{p.description}</div>}
                {p.responsibilities.length > 0 && (
                  <>
                    <div className="r-sub">内容</div>
                    <BulletList items={p.responsibilities} />
                  </>
                )}
                {p.achievements.length > 0 && (
                  <>
                    <div className="r-sub">业绩</div>
                    <BulletList items={p.achievements} />
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {education.length > 0 && (
        <>
          <div className="r-section-title">教育经历</div>
          <div className="r-timeline">
            {education.map(e => (
              <div key={e.id} className="r-item">
                <div className="r-item-period">{e.period}</div>
                <div>
                  <span className="r-item-title">{e.school}</span>
                  <span className="r-item-role">{e.degree}　{e.major}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {skills.length > 0 && (
        <>
          <div className="r-section-title">技能</div>
          <div className="r-skills">
            {skills.map((s, i) => (
              <span key={i} className="r-skill">{s}</span>
            ))}
          </div>
        </>
      )}
    </>
  )
}
