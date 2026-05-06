import { Input } from '@/components/ui/input'
import type { Watermark } from '../types'

interface WatermarkFormProps {
  value: Watermark
  onChange: (next: Watermark) => void
}

export function WatermarkForm({ value, onChange }: WatermarkFormProps) {
  const set = (patch: Partial<Watermark>) => onChange({ ...value, ...patch })
  return (
    <div className="grid gap-2">
      <Field label="主署名">
        <Input
          value={value.signature}
          onChange={e => set({ signature: e.target.value })}
          placeholder="@kai"
        />
      </Field>
      <Field label="副署名">
        <Input
          value={value.subSignature}
          onChange={e => set({ subSignature: e.target.value })}
          placeholder="kai-toolbox · markdown 卡片"
        />
      </Field>
      <Field label="二维码图片 URL">
        <Input
          value={value.qrcodeUrl}
          onChange={e => set({ qrcodeUrl: e.target.value })}
          placeholder="https://… 或留空隐藏"
        />
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-[var(--color-muted-foreground)]">{label}</span>
      {children}
    </label>
  )
}
