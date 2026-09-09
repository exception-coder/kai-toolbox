import { authFetch, http } from '@/lib/api'
import type { Notice, NoticePage, Overview, Rule, Run, Site } from './types'
import type { StructureSchema, StructuredResult, StructureCorrection } from './structureTypes'
import type { DiscoveryBatch, DiscoveryLinks } from './discoveryTypes'

const base = '/procurement'
const body = (method: string, value: unknown) => ({ method, body: JSON.stringify(value) })
export const procurementApi = {
  ruleGroups: () => http<import('./ruleGroupTypes').RuleGroup[]>(`${base}/rule-groups`),
  saveRuleGroup: (rule: import('./ruleGroupTypes').RuleGroup['rule']) => http(`${base}/rule-groups/${encodeURIComponent(rule.id)}`, body('PUT', rule)),
  exportNotices: async (search: string, siteId: string, status: string) => {
    const response = await authFetch(`${base}/business-notices/export?${new URLSearchParams({ search, siteId, status })}`)
    if (!response.ok) {
      const error = await response.json().catch(() => null) as { message?: string } | null
      throw new Error(error?.message || `导出失败（${response.status}），请重试`)
    }
    if (!response.headers.get('content-type')?.includes('spreadsheetml.sheet')) throw new Error('未收到 Excel 文件，请确认登录后重试')
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = `招采采集结果_${new Date().toISOString().slice(0, 10)}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10000)
  },
  experiences: () => http<import('./experienceTypes').ExperienceCatalog>(`${base}/experiences`),
  exampleRuns: () => http<import('./experienceTypes').ExampleRun[]>(`${base}/experiences/regressions`),
  regressExamples: () => http<import('./experienceTypes').ExampleRun>(`${base}/experiences/regressions`, { method: 'POST' }),
  businessNotices: (search: string, siteId: string, status: string, page: number) =>
    http<{ fields: StructureSchema['fields']; items: { notice: Notice; values: Record<string, string> }[]; total: number; page: number; pageSize: number }>(`${base}/business-notices?${new URLSearchParams({ search, siteId, status, page: String(page) })}`),
  discovery: () => http<DiscoveryBatch[]>(`${base}/discovery`),
  discoverToday: () => http<DiscoveryBatch>(`${base}/discovery`, { method: 'POST' }),
  discoveryBatch: (id: string) => http<DiscoveryBatch>(`${base}/discovery/${encodeURIComponent(id)}`),
  discoveryLinks: (id: string, regionStatus: string, page: number) => http<DiscoveryLinks>(`${base}/discovery/${encodeURIComponent(id)}/links?${new URLSearchParams({ regionStatus, page: String(page) })}`),
  discoveryDetails: (id: string, parseOnly: boolean) => http<Run>(`${base}/discovery/${encodeURIComponent(id)}/details?parseOnly=${parseOnly}`, { method: 'POST' }),
  structure: () => http<StructureSchema>(`${base}/structure`),
  saveStructure: (schema: StructureSchema) => http<StructureSchema>(`${base}/structure`, body('PUT', schema)),
  structured: (id: string) => http<StructuredResult>(`${base}/notices/${encodeURIComponent(id)}/structured`),
  correct: (id: string, correction: StructureCorrection) => http<StructuredResult>(`${base}/notices/${encodeURIComponent(id)}/structured`, body('PUT', correction)),
  overview: () => http<Overview>(`${base}/overview`),
  sites: () => http<Site[]>(`${base}/sites`),
  rules: () => http<Rule[]>(`${base}/rules`),
  runs: () => http<Run[]>(`${base}/runs`),
  notices: (search: string, siteId: string, status: string, page: number) =>
    http<NoticePage>(`${base}/notices?${new URLSearchParams({ search, siteId, status, page: String(page) })}`),
  notice: (id: string) => http<Notice>(`${base}/notices/${encodeURIComponent(id)}`),
  addNotice: (url: string, title: string) => http<Notice>(`${base}/notices`, body('POST', { url, title })),
  start: (siteId = '', noticeId = '', parseWithLlm = true, parseOnly = false) =>
    http<Run>(`${base}/runs`, body('POST', { siteId, noticeId, parseWithLlm, parseOnly })),
  saveSite: (site: Site) => http<Site>(`${base}/sites/${encodeURIComponent(site.id)}`, body('PUT', site)),
  discover: (id: string) => http<{ title: string; url: string }[]>(`${base}/sites/${encodeURIComponent(id)}/discover`, { method: 'POST' }),
  saveRule: (rule: Rule, create: boolean) => http<Rule>(create ? `${base}/rules` : `${base}/rules/${encodeURIComponent(rule.id)}`,
    body(create ? 'POST' : 'PUT', rule)),
  deleteRule: (id: string) => http<void>(`${base}/rules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
