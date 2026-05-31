// 深色左栏 + 右内容简历模板
import type { ResumeData } from '../../types'
import { Avatar, BulletList } from './shared'

export function SidebarTemplate({ data }: { data: ResumeData }) {
  const { basics, work, projects, education, skills } = data
  return (
    <>
      <aside className="r-side">
        <div className="r-avatar">
          <Avatar basics={basics} />
        </div>
        <div className="r-name">{basics.name || '姓名'}</div>
        {basics.jobIntent && <div className="r-intent">{basics.jobIntent}</div>}

        <div className="r-side-title">基本信息</div>
        {basics.gender && (
          <div className="r-contact-row"><strong>性别</strong>{basics.gender}</div>
        )}
        {basics.age && (
          <div className="r-contact-row"><strong>年龄</strong>{basics.age} 岁</div>
        )}
        {basics.experienceYears && (
          <div className="r-contact-row"><strong>经验</strong>{basics.experienceYears}</div>
        )}
        {basics.city && (
          <div className="r-contact-row"><strong>城市</strong>{basics.city}</div>
        )}
        {basics.email && (
          <div className="r-contact-row"><strong>邮箱</strong>{basics.email}</div>
        )}
        {basics.phone && (
          <div className="r-contact-row"><strong>电话</strong>{basics.phone}</div>
        )}

        {basics.advantage && (
          <>
            <div className="r-side-title">个人优势</div>
            <div style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.7 }}>
              {basics.advantage}
            </div>
          </>
        )}

        {skills.length > 0 && (
          <>
            <div className="r-side-title">技能</div>
            <div className="r-side-skills">
              {skills.map((s, i) => (
                <span key={i} className="r-skill">{s}</span>
              ))}
            </div>
          </>
        )}
      </aside>

      <main className="r-main">
        {work.length > 0 && (
          <section className="r-section">
            <div className="r-section-title">工作经历</div>
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
          </section>
        )}

        {projects.length > 0 && (
          <section className="r-section">
            <div className="r-section-title">项目经历</div>
            {projects.map(p => (
              <div key={p.id} className="r-item">
                <div className="r-item-head">
                  <div>
                    <span className="r-item-title">{p.name}</span>
                    <span className="r-item-role">{p.role}</span>
                  </div>
                  <div className="r-item-period">{p.period}</div>
                </div>
                {p.description && <div style={{ marginBottom: 4, color: '#374151' }}>{p.description}</div>}
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
          </section>
        )}

        {education.length > 0 && (
          <section className="r-section">
            <div className="r-section-title">教育经历</div>
            {education.map(e => (
              <div key={e.id} className="r-item">
                <div className="r-item-head">
                  <div>
                    <span className="r-item-title">{e.school}</span>
                    <span className="r-item-role">{e.degree}　{e.major}</span>
                  </div>
                  <div className="r-item-period">{e.period}</div>
                </div>
              </div>
            ))}
          </section>
        )}
      </main>
    </>
  )
}
