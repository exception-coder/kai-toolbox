// 简历基础信息表单：优先填写招聘方第一眼会看的身份信息。
import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Upload, X } from 'lucide-react'
import { OptimizeButton } from '../optimize'
import type { OptimizationResult } from '../optimize'
import type { ResumeBasics } from '../types'

interface Props {
  value: ResumeBasics
  onChange: (next: ResumeBasics) => void
}

export function BasicsForm({ value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  function patch(partial: Partial<ResumeBasics>) {
    onChange({ ...value, ...partial })
  }

  function pickAvatar() {
    fileRef.current?.click()
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') patch({ avatar: reader.result })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,_1fr)_180px]">
      <div className="grid gap-2.5 sm:grid-cols-2">
      <Field label="姓名" full>
        <Input value={value.name} onChange={e => patch({ name: e.target.value })} placeholder="张三" />
      </Field>

      <Field label="性别">
        <Input value={value.gender} onChange={e => patch({ gender: e.target.value })} placeholder="男 / 女" />
      </Field>
      <Field label="年龄">
        <Input value={value.age} onChange={e => patch({ age: e.target.value })} placeholder="28" />
      </Field>
      <Field label="工作年限">
        <Input
          value={value.experienceYears}
          onChange={e => patch({ experienceYears: e.target.value })}
          placeholder="5 年工作经验"
        />
      </Field>
      <Field label="求职意向">
        <Input value={value.jobIntent} onChange={e => patch({ jobIntent: e.target.value })} placeholder="Java 开发" />
      </Field>
      <Field label="期望城市">
        <Input value={value.city} onChange={e => patch({ city: e.target.value })} placeholder="广州" />
      </Field>
      <Field label="邮箱">
        <Input value={value.email} onChange={e => patch({ email: e.target.value })} placeholder="name@example.com" />
      </Field>
      <Field label="手机">
        <Input value={value.phone} onChange={e => patch({ phone: e.target.value })} placeholder="138xxxx" />
      </Field>

      <Field label="个人优势" full>
        <div className="flex items-start gap-2">
          <textarea
            value={value.advantage}
            onChange={e => patch({ advantage: e.target.value })}
            rows={2}
            placeholder="一句话总结你最核心的能力，例如：独立架构设计能力 / 全链路问题排查"
            className="flex-1 rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          />
          <OptimizeButton
            target={{
              sectionType: 'SELF_INTRO',
              buildOriginal: () => value.advantage,
              applyAccepted: (result: OptimizationResult) => {
                patch({ advantage: result.optimizedContent })
              },
            }}
            label="AI 优化"
          />
        </div>
      </Field>
      </div>

      <div className="flex flex-col justify-between rounded-lg border bg-[var(--color-muted)]/30 p-3">
        <div className="mx-auto h-24 w-24 overflow-hidden rounded-xl border bg-[var(--color-background)] shadow-sm">
          {value.avatar ? (
            <img src={value.avatar} alt="avatar" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-muted-foreground)]">
              头像
            </div>
          )}
        </div>
        <div className="mt-3 grid gap-2">
          <Button type="button" variant="outline" size="sm" onClick={pickAvatar}>
            <Upload className="h-3.5 w-3.5" />
            上传头像
          </Button>
          {value.avatar && (
            <Button type="button" variant="ghost" size="sm" onClick={() => patch({ avatar: '' })}>
              <X className="h-3.5 w-3.5" />
              清除头像
            </Button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileChange}
        />
      </div>
    </div>
  )
}

function Field({
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
