import { Segmented } from '@/components/ui/segmented'
import type { InputMethod } from '../types'

interface Props {
  value: InputMethod
  onChange: (next: InputMethod) => void
}

const OPTIONS: ReadonlyArray<{ value: InputMethod; label: string }> = [
  { value: 'text', label: '文字' },
  { value: 'voice', label: '语音' },
  { value: 'file', label: '附件' },
]

export function ComposerTabs({ value, onChange }: Props) {
  return <Segmented value={value} onChange={onChange} options={OPTIONS} size="md" />
}
