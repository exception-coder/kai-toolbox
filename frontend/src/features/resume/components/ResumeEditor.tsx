// 简历编辑器：按简历产出流程组织分区，给每段内容明确完成状态。
import type { LucideIcon } from 'lucide-react'
import { Briefcase, CheckCircle2, Circle, FolderKanban, GraduationCap, Tags, User } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { BasicsForm } from './BasicsForm'
import { ListEditor, MultiLineInput, TagsInput } from './ListEditor'
import { OptimizeButton } from '../optimize'
import type { OptimizationResult } from '../optimize'
import type { ResumeQuality } from '../pages/ResumePage'
import type {
  EducationItem,
  ProjectExperience,
  ResumeData,
  WorkExperience,
} from '../types'

interface Props {
  data: ResumeData
  quality: ResumeQuality
  onChange: (next: ResumeData) => void
}

export function ResumeEditor({ data, quality, onChange }: Props) {
  function patch(p: Partial<ResumeData>) {
    onChange({ ...data, ...p })
  }

  return (
    <div className="flex flex-col gap-3">
      <Section
        title="基本信息"
        subtitle="先锁定身份、目标岗位和联系方式"
        icon={User}
        done={quality.basicsReady}
      >
        <BasicsForm
          value={data.basics}
          onChange={basics => patch({ basics })}
        />
      </Section>

      <Section
        title="工作经历"
        subtitle="把职责写清，再把结果写硬"
        icon={Briefcase}
        count={data.work.length}
        done={quality.workReady}
      >
        <ListEditor<WorkExperience>
          items={data.work}
          onChange={work => patch({ work })}
          create={createWork}
          titleOf={w => `${w.company || '公司'}　${w.role || ''}`}
          emptyLabel="还没有工作经历"
          addLabel="新增工作经历"
          renderItem={(item, change) => (
            <div className="grid gap-2.5 sm:grid-cols-2">
              <FieldRow label="公司" full>
                <Input value={item.company} onChange={e => change({ ...item, company: e.target.value })} />
              </FieldRow>
              <FieldRow label="职位">
                <Input value={item.role} onChange={e => change({ ...item, role: e.target.value })} />
              </FieldRow>
              <FieldRow label="时间">
                <Input
                  value={item.period}
                  onChange={e => change({ ...item, period: e.target.value })}
                  placeholder="2020.04 - 至今"
                />
              </FieldRow>
              <FieldRow label="内容（每行一条）" full>
                <MultiLineInput
                  value={item.responsibilities}
                  onChange={v => change({ ...item, responsibilities: v })}
                  rows={6}
                />
              </FieldRow>
              <FieldRow label="业绩（每行一条）" full>
                <MultiLineInput
                  value={item.achievements}
                  onChange={v => change({ ...item, achievements: v })}
                  rows={4}
                />
              </FieldRow>
              <div className="sm:col-span-2 flex justify-end">
                <OptimizeButton
                  target={{
                    sectionType: 'WORK',
                    itemTitle: `${item.company}${item.role ? ' · ' + item.role : ''}`,
                    buildOriginal: () =>
                      JSON.stringify({
                        company: item.company,
                        role: item.role,
                        period: item.period,
                        responsibilities: item.responsibilities,
                        achievements: item.achievements,
                      }),
                    applyAccepted: (result: OptimizationResult) => {
                      try {
                        const parsed = JSON.parse(result.optimizedContent)
                        change({
                          ...item,
                          company: typeof parsed.company === 'string' ? parsed.company : item.company,
                          role: typeof parsed.role === 'string' ? parsed.role : item.role,
                          period: typeof parsed.period === 'string' ? parsed.period : item.period,
                          responsibilities: Array.isArray(parsed.responsibilities)
                            ? parsed.responsibilities.map((s: unknown) => String(s))
                            : item.responsibilities,
                          achievements: Array.isArray(parsed.achievements)
                            ? parsed.achievements.map((s: unknown) => String(s))
                            : item.achievements,
                        })
                      } catch (e) {
                        console.error('[resume] WORK optimize 写回失败', e)
                      }
                    },
                  }}
                  label="AI 优化本段"
                />
              </div>
            </div>
          )}
        />
      </Section>

      <Section
        title="项目经历"
        subtitle="突出复杂度、职责边界和可量化收益"
        icon={FolderKanban}
        count={data.projects.length}
        done={quality.projectsReady}
      >
        <ListEditor<ProjectExperience>
          items={data.projects}
          onChange={projects => patch({ projects })}
          create={createProject}
          titleOf={p => `${p.name || '项目'}　${p.role || ''}`}
          emptyLabel="还没有项目经历"
          addLabel="新增项目经历"
          renderItem={(item, change) => (
            <div className="grid gap-2.5 sm:grid-cols-2">
              <FieldRow label="项目名称">
                <Input value={item.name} onChange={e => change({ ...item, name: e.target.value })} />
              </FieldRow>
              <FieldRow label="担任角色">
                <Input value={item.role} onChange={e => change({ ...item, role: e.target.value })} placeholder="项目负责人 / 主程序员" />
              </FieldRow>
              <FieldRow label="时间" full>
                <Input value={item.period} onChange={e => change({ ...item, period: e.target.value })} />
              </FieldRow>
              <FieldRow label="项目描述" full>
                <textarea
                  value={item.description}
                  onChange={e => change({ ...item, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                />
              </FieldRow>
              <FieldRow label="内容（每行一条）" full>
                <MultiLineInput
                  value={item.responsibilities}
                  onChange={v => change({ ...item, responsibilities: v })}
                  rows={6}
                />
              </FieldRow>
              <FieldRow label="业绩（每行一条）" full>
                <MultiLineInput
                  value={item.achievements}
                  onChange={v => change({ ...item, achievements: v })}
                  rows={4}
                />
              </FieldRow>
              <div className="sm:col-span-2 flex justify-end">
                <OptimizeButton
                  target={{
                    sectionType: 'PROJECT',
                    itemTitle: `${item.name}${item.role ? ' · ' + item.role : ''}`,
                    buildOriginal: () =>
                      JSON.stringify({
                        name: item.name,
                        role: item.role,
                        period: item.period,
                        description: item.description,
                        responsibilities: item.responsibilities,
                        achievements: item.achievements,
                      }),
                    applyAccepted: (result: OptimizationResult) => {
                      try {
                        const parsed = JSON.parse(result.optimizedContent)
                        change({
                          ...item,
                          name: typeof parsed.name === 'string' ? parsed.name : item.name,
                          role: typeof parsed.role === 'string' ? parsed.role : item.role,
                          period: typeof parsed.period === 'string' ? parsed.period : item.period,
                          description:
                            typeof parsed.description === 'string' ? parsed.description : item.description,
                          responsibilities: Array.isArray(parsed.responsibilities)
                            ? parsed.responsibilities.map((s: unknown) => String(s))
                            : item.responsibilities,
                          achievements: Array.isArray(parsed.achievements)
                            ? parsed.achievements.map((s: unknown) => String(s))
                            : item.achievements,
                        })
                      } catch (e) {
                        console.error('[resume] PROJECT optimize 写回失败', e)
                      }
                    },
                  }}
                  label="AI 优化本段"
                />
              </div>
            </div>
          )}
        />
      </Section>

      <Section
        title="教育经历"
        subtitle="简洁呈现学校、专业、学历和时间"
        icon={GraduationCap}
        count={data.education.length}
        done={quality.educationReady}
      >
        <ListEditor<EducationItem>
          items={data.education}
          onChange={education => patch({ education })}
          create={createEducation}
          titleOf={e => `${e.school || '学校'}　${e.major || ''}`}
          emptyLabel="还没有教育经历"
          addLabel="新增教育经历"
          renderItem={(item, change) => (
            <div className="grid gap-2.5 sm:grid-cols-2">
              <FieldRow label="学校" full>
                <Input value={item.school} onChange={e => change({ ...item, school: e.target.value })} />
              </FieldRow>
              <FieldRow label="学历">
                <Input value={item.degree} onChange={e => change({ ...item, degree: e.target.value })} placeholder="本科 / 硕士" />
              </FieldRow>
              <FieldRow label="专业">
                <Input value={item.major} onChange={e => change({ ...item, major: e.target.value })} />
              </FieldRow>
              <FieldRow label="时间" full>
                <Input value={item.period} onChange={e => change({ ...item, period: e.target.value })} placeholder="2014 - 2018" />
              </FieldRow>
            </div>
          )}
        />
      </Section>

      <Section
        title="技能标签"
        subtitle="建议放 6 到 12 个最能匹配岗位的关键词"
        icon={Tags}
        count={data.skills.length}
        done={quality.skillsReady}
      >
        <TagsInput
          value={data.skills}
          onChange={skills => patch({ skills })}
        />
        <div className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
          用逗号或换行分隔；空白会自动去掉
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  subtitle,
  icon: Icon,
  count,
  done,
  children,
}: {
  title: string
  subtitle: string
  icon: LucideIcon
  count?: number
  done: boolean
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-lg border bg-[var(--color-card)] shadow-sm">
      <header className="flex items-start gap-2 border-b bg-[var(--color-muted)]/35 px-3 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
            {count != null && count > 0 && (
              <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--color-primary)]">
            {count}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-[var(--color-muted-foreground)]">{subtitle}</p>
        </div>
        <span
          className={
            done
              ? 'flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'flex items-center gap-1 rounded-full bg-[var(--color-muted)] px-2 py-1 text-[11px] font-medium text-[var(--color-muted-foreground)]'
          }
        >
          {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
          {done ? '已就绪' : '待完善'}
        </span>
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

function FieldRow({
  label,
  full,
  children,
}: {
  label: string
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={full ? 'sm:col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
      <span className="text-xs text-[var(--color-muted-foreground)]">{label}</span>
      {children}
    </label>
  )
}

function uid(prefix: string): string {
  return prefix + '-' + Math.random().toString(36).slice(2, 9)
}

function createWork(): WorkExperience {
  return {
    id: uid('w'),
    company: '',
    role: '',
    period: '',
    responsibilities: [],
    achievements: [],
  }
}

function createProject(): ProjectExperience {
  return {
    id: uid('p'),
    name: '',
    role: '',
    period: '',
    description: '',
    responsibilities: [],
    achievements: [],
  }
}

function createEducation(): EducationItem {
  return {
    id: uid('e'),
    school: '',
    degree: '',
    major: '',
    period: '',
  }
}
