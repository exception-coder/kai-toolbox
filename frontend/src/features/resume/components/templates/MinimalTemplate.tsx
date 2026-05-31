// 极简黑白衬线简历模板
import type { ResumeData } from '../../types'
import { BulletList, MetaInline } from './shared'

export function MinimalTemplate({ data }: { data: ResumeData }) {
  const { basics, work, projects, education, skills } = data
  return (
    <>
      <div className="r-header">
        <div className="r-name">{basics.name || '姓名'}</div>
        {basics.jobIntent && <div className="r-intent">{basics.jobIntent}</div>}
        <MetaInline basics={basics} />
      </div>

      {basics.advantage && (
        <>
          <div className="r-section-title">Profile</div>
          <div style={{ fontStyle: 'italic', color: '#222' }}>{basics.advantage}</div>
        </>
      )}

      {work.length > 0 && (
        <>
          <div className="r-section-title">Experience</div>
          {work.map(w => (
            <div key={w.id} className="r-item">
              <div className="r-item-head">
                <div>
                  <span className="r-item-title">{w.company}</span>
                  <span className="r-item-role">{w.role}</span>
                </div>
                <div className="r-item-period">{w.period}</div>
              </div>
              {w.responsibilities.length > 0 && (
                <>
                  <div className="r-sub">Responsibilities</div>
                  <BulletList items={w.responsibilities} />
                </>
              )}
              {w.achievements.length > 0 && (
                <>
                  <div className="r-sub">Achievements</div>
                  <BulletList items={w.achievements} />
                </>
              )}
            </div>
          ))}
        </>
      )}

      {projects.length > 0 && (
        <>
          <div className="r-section-title">Projects</div>
          {projects.map(p => (
            <div key={p.id} className="r-item">
              <div className="r-item-head">
                <div>
                  <span className="r-item-title">{p.name}</span>
                  <span className="r-item-role">{p.role}</span>
                </div>
                <div className="r-item-period">{p.period}</div>
              </div>
              {p.description && <div style={{ marginBottom: 4 }}>{p.description}</div>}
              {p.responsibilities.length > 0 && (
                <>
                  <div className="r-sub">Highlights</div>
                  <BulletList items={p.responsibilities} />
                </>
              )}
              {p.achievements.length > 0 && (
                <>
                  <div className="r-sub">Outcomes</div>
                  <BulletList items={p.achievements} />
                </>
              )}
            </div>
          ))}
        </>
      )}

      {education.length > 0 && (
        <>
          <div className="r-section-title">Education</div>
          {education.map(e => (
            <div key={e.id} className="r-item">
              <div className="r-item-head">
                <div>
                  <span className="r-item-title">{e.school}</span>
                  <span className="r-item-role">{e.degree}, {e.major}</span>
                </div>
                <div className="r-item-period">{e.period}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {skills.length > 0 && (
        <>
          <div className="r-section-title">Skills</div>
          <div className="r-skills">{skills.join(' · ')}</div>
        </>
      )}
    </>
  )
}
