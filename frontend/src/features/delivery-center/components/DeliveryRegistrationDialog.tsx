import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { PrdBusinessFields } from '@/features/prd-clarify/public-api'
import { PrdDraftDialog } from './PrdDraftDialog'
import { FeishuRequirementImportDialog } from './FeishuRequirementImportDialog'
import { mapFeishuBusinessFields } from '../lib/feishuBusinessFields'

/** 导入只预填草稿，创建仍由原 PRD 生命周期负责。 */
export function DeliveryRegistrationDialog({ mode, onClose }: { mode: 'standard' | 'feishu'; onClose: () => void }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [draft, setDraft] = useState<{ title: string; businessFields: PrdBusinessFields }>()
  if (mode === 'feishu' && !draft) return <FeishuRequirementImportDialog onClose={onClose}
    onSelect={record => setDraft({ title: record.title, businessFields: mapFeishuBusinessFields(record) })} />
  return <PrdDraftDialog initialProject={params.get('project') ?? ''} initialShortTitle={draft?.title}
    initialBusinessFields={draft?.businessFields} onClose={onClose}
    onCreated={id => { onClose(); navigate(`/tools/prd-clarify?sessionId=${encodeURIComponent(id)}`) }} />
}
