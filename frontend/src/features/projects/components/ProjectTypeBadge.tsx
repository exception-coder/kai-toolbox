import {
  Coffee,
  FileCode,
  Folder,
  GitBranch,
  Hexagon,
  Package,
  Snail,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import type { ProjectType } from '../types'

interface BadgeMeta {
  label: string
  icon: ComponentType<LucideProps>
  className: string
}

const META: Record<ProjectType, BadgeMeta> = {
  flutter: { label: 'Flutter', icon: Hexagon,   className: 'bg-sky-500/15 text-sky-400' },
  maven:   { label: 'Maven',   icon: Coffee,    className: 'bg-orange-500/15 text-orange-400' },
  gradle:  { label: 'Gradle',  icon: Coffee,    className: 'bg-emerald-500/15 text-emerald-400' },
  node:    { label: 'Node',    icon: Package,   className: 'bg-lime-500/15 text-lime-400' },
  python:  { label: 'Python',  icon: Snail,     className: 'bg-yellow-500/15 text-yellow-400' },
  git:     { label: 'Git',     icon: GitBranch, className: 'bg-violet-500/15 text-violet-400' },
  other:   { label: '目录',    icon: Folder,    className: 'bg-slate-500/15 text-slate-400' },
}

export function ProjectTypeBadge({ type }: { type: ProjectType }) {
  const meta = META[type] ?? { label: type, icon: FileCode, className: 'bg-slate-500/15 text-slate-400' }
  const Icon = meta.icon
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${meta.className}`}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  )
}
