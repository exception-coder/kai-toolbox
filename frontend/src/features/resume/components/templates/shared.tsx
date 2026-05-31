// 模板共用的小组件：分段块、列表渲染、姓名首字头像兜底
import type { ResumeBasics } from '../../types'

export function Avatar({ basics }: { basics: ResumeBasics }) {
  if (basics.avatar) {
    return <img src={basics.avatar} alt={basics.name || 'avatar'} />
  }
  const initial = (basics.name || '?').slice(0, 1)
  return <>{initial}</>
}

export function MetaInline({ basics }: { basics: ResumeBasics }) {
  const items = [
    basics.gender,
    basics.age && `${basics.age}岁`,
    basics.experienceYears,
    basics.city && `期望城市：${basics.city}`,
    basics.email,
    basics.phone,
  ].filter(Boolean) as string[]
  return (
    <div className="r-meta">
      {items.map((it, i) => (
        <span key={i}>{it}</span>
      ))}
    </div>
  )
}

export function BulletList({ items }: { items: string[] }) {
  const filtered = items.filter(s => s && s.trim())
  if (filtered.length === 0) return null
  return (
    <ul>
      {filtered.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  )
}
