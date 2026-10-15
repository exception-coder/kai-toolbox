import { http } from '@/lib/api'

export interface ConsultAttachmentPolicy {
  uploadMaxMb: number
  readMaxMb: number
  effectiveUploadBytes: number
  effectiveReadBytes: number
  transportMaxBytes: number
  maxAttachments: number
}
export const getConsultAttachmentPolicy = () => http<ConsultAttachmentPolicy>('/fore-consult/attachments/policy')
export const saveConsultAttachmentPolicy = (policy: Pick<ConsultAttachmentPolicy, 'uploadMaxMb' | 'readMaxMb'>) =>
  http<ConsultAttachmentPolicy>('/fore-consult/attachments/policy', { method: 'PUT', body: JSON.stringify(policy) })

/** 在预览或网络上传前使用服务器最新上限，读取失败时不绕过检查。 */
export async function checkConsultFiles(files: File[]) {
  const policy = await getConsultAttachmentPolicy()
  const accepted = files.filter(file => file.size <= policy.effectiveUploadBytes)
  const rejected = files.filter(file => file.size > policy.effectiveUploadBytes)
  return { files: accepted, notice: rejected.length
    ? `${rejected.map(file => file.name).join('、')} 超过当前单文件上限 ${policy.effectiveUploadBytes / 1024 / 1024} MiB，未添加；可联系管理员调整。`
    : null }
}

export interface ConsultDatabaseConfiguration {
  workflowVersion: number | null
  selectedBindingIds: string[]
  resources: Array<{ bindingId: string; systemName: string; name: string; environment: string; endpoint?: string; state: string; configurationUrl: string }>
}
export const getConsultDatabaseConfiguration = () => http<ConsultDatabaseConfiguration>('/fore-consult/resources/configuration')
