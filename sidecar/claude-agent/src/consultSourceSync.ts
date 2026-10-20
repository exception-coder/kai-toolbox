import type { SourceRoutingContext } from './consultSourceProjects.js'

export interface SourceSyncEvidence {
  status: string
  message: string
  branch: string | null
  headAtCheck: string | null
  checkedAt: number
}

/** 同步由可信服务端执行；传输状态未知时不让本次读取与后台同步竞速。 */
export async function synchronizeConsultSource(context: SourceRoutingContext, project?: string): Promise<SourceSyncEvidence | null> {
  if (!context.apiBase || !context.session || !context.token) return null
  let response: Response
  try {
    response = await fetch(`${context.apiBase}/api/fore-consult/resources/sessions/${encodeURIComponent(context.session)}/source-sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Consult-Resource-Token': context.token },
      body: JSON.stringify({ project: project ?? null }), signal: AbortSignal.timeout(180_000),
    })
  } catch {
    throw new Error('源码同步请求未完成，状态未确认；本次停止读取，请稍后重试')
  }
  if (response.status === 404) return { status: 'UNVERIFIED', message: '源码同步接口尚未部署，使用本地源码，不代表远端最新版本', branch: null, headAtCheck: null, checkedAt: Date.now() }
  if (!response.ok) throw new Error('源码同步状态未确认，本次停止读取；请稍后重试，不要假定已同步或回退到其他目录')
  const value: unknown = await response.json()
  const data = value as SourceSyncEvidence
  if (!data || !['SYNCING', 'LOCAL_ONLY', 'UNVERIFIED', 'LOCAL_CHANGES', 'UP_TO_DATE', 'BLOCKED', 'UPDATED'].includes(data.status)
      || typeof data.message !== 'string' || data.message.length > 1000 || typeof data.checkedAt !== 'number'
      || !Number.isFinite(data.checkedAt) || (data.branch !== null && typeof data.branch !== 'string')
      || (data.headAtCheck !== null && (typeof data.headAtCheck !== 'string' || !/^[a-f0-9]{40,64}$/.test(data.headAtCheck)))) {
    throw new Error('源码同步结果无效，本次停止读取')
  }
  if (data.status === 'SYNCING') throw new Error('该项目仍在同步，请稍后再读取；不要并行读取未确认的源码版本')
  return data
}
