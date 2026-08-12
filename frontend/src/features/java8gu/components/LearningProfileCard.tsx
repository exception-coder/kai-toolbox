import { BookMarked, BriefcaseBusiness, CalendarRange } from 'lucide-react'
import type { LearningProfile } from '../lib/learningProfile'
import {
  EXPERIENCE_OPTIONS,
  getExperienceOption,
  getRoleOption,
  ROLE_OPTIONS,
  type ExperienceLevel,
  type TargetRole,
} from '../lib/learningProfile'

interface Props {
  profile: LearningProfile
  recommendedCount: number
  onChange: (profile: LearningProfile) => void
}

export function LearningProfileCard({ profile, recommendedCount, onChange }: Props) {
  const experience = getExperienceOption(profile.experience)
  const role = getRoleOption(profile.role)

  return (
    <section className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.09] via-[var(--color-card)] to-violet-500/[0.06] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BookMarked className="h-4 w-4 text-indigo-500" />
            我该看哪些？
          </div>
          <p className="mt-1 text-[11px] leading-4 text-[var(--color-muted-foreground)]">
            根据原文年限建议，再按目标岗位收窄。
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-indigo-500/10 px-2 py-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
          {recommendedCount.toLocaleString()} 题
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="space-y-1 text-[10px] font-medium text-[var(--color-muted-foreground)]">
          <span className="flex items-center gap-1"><CalendarRange className="h-3 w-3" />工作年限</span>
          <select
            value={profile.experience}
            onChange={event => onChange({ ...profile, experience: event.target.value as ExperienceLevel })}
            className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs font-medium text-[var(--color-foreground)] outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
          >
            {EXPERIENCE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-[10px] font-medium text-[var(--color-muted-foreground)]">
          <span className="flex items-center gap-1"><BriefcaseBusiness className="h-3 w-3" />目标岗位</span>
          <select
            value={profile.role}
            onChange={event => onChange({ ...profile, role: event.target.value as TargetRole })}
            className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs font-medium text-[var(--color-foreground)] outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
          >
            {ROLE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3 rounded-xl bg-[var(--color-background)]/75 px-3 py-2.5 text-[11px] leading-5">
        <div className="flex flex-wrap items-center gap-1.5 font-semibold">
          <span>{experience.seniority}</span>
          <span className="text-[var(--color-muted-foreground)]">·</span>
          <span>八股建议 {experience.interviewRatio}</span>
        </div>
        <p className="mt-1 text-[var(--color-muted-foreground)]">{experience.focus}</p>
        {profile.role !== 'java-backend' && (
          <p className="mt-1 font-medium text-indigo-600 dark:text-indigo-300">岗位侧重：{role.focus}</p>
        )}
        <p className="mt-1 border-t border-[var(--color-border)]/60 pt-1 text-[10px] text-[var(--color-muted-foreground)]">
          原文建议：完成清单 50% 可保底，70%–80% 可覆盖大多数面试。
        </p>
      </div>
    </section>
  )
}
