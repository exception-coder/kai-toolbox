import { useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, FileJson, Loader2, Search, Table2, Upload, X } from 'lucide-react'
import {
  pullFeishuRequirements,
  type FeishuRequirementPullResult,
  type FeishuRequirementRecord,
} from '../api'

const DEFAULT_FEISHU_URL =
  'https://icng2x3chkh2.feishu.cn/wiki/ZuYrwTMLKiBwhikqsDicqbrQn9g?table=tbllHTCaxd8eseYH&view=vew71ufIPJ&open_in_browser=true'

interface FeishuRequirementImportDialogProps {
  onClose: () => void
  onSelect: (record: FeishuRequirementRecord, sourceUrl: string) => void
}

export function FeishuRequirementImportDialog({
  onClose,
  onSelect,
}: FeishuRequirementImportDialogProps) {
  const [url, setUrl] = useState(DEFAULT_FEISHU_URL)
  const [harName, setHarName] = useState('')
  const [result, setResult] = useState<FeishuRequirementPullResult | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const records = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return result?.records ?? []
    return (result?.records ?? []).filter(record =>
      record.title.toLowerCase().includes(normalized)
      || Object.entries(record.fields).some(([key, value]) =>
        key.toLowerCase().includes(normalized) || value.toLowerCase().includes(normalized)),
    )
  }, [query, result])

  const handleHarSelection = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError('')
    setResult(null)
    setHarName('')
    try {
      if (file.size > 100 * 1024 * 1024) {
        throw new Error('HAR 文件不能超过 100 MB')
      }
      const parsed = parseFeishuHar(await file.text())
      const sourceUrl = parsed.sourceUrl || url.trim()
      const response = await pullFeishuRequirements(sourceUrl, parsed.cookie, parsed.recordsUrl)
      setUrl(sourceUrl)
      setHarName(file.name)
      setResult(response)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'HAR 解析或飞书需求拉取失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="feishu-import-title"
        className="flex max-h-[92vh] w-full max-w-4xl flex-col border border-[var(--color-border)] bg-[var(--color-background)] shadow-2xl"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#3370ff]">Feishu Bitable</p>
            <h2 id="feishu-import-title" className="mt-1 flex items-center gap-2 text-base font-semibold">
              <Table2 className="h-4 w-4 text-[#3370ff]" />从飞书拉取需求
            </h2>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              使用当前账号的网页登录态只读加载表格，选中记录后进入现有 PRD 起草流程。
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 border-b border-[var(--color-border)] p-5">
          <label className="block text-xs font-medium">
            <span className="mb-1.5 flex items-center justify-between">
              飞书表格链接
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-normal text-[#3370ff]">
                打开原表 <ExternalLink className="h-3 w-3" />
              </a>
            </span>
            <input
              value={url}
              onChange={event => {
                setUrl(event.target.value)
                setResult(null)
              }}
              className={inputClass}
            />
          </label>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium">上传包含敏感数据的 HAR 文件</p>
              <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-muted-foreground)]">
                HAR 仅在当前浏览器内存中解析；系统自动提取 Cookie 并拉取需求，不上传或保存整份文件。
              </p>
              {harName && !error && (
                <p className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />已解析 {harName}
                </p>
              )}
              {error && <p className="mt-1.5 text-xs text-[var(--color-danger)]">{error}</p>}
            </div>
            <label
              className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 bg-[#3370ff] px-4 py-2 text-xs font-medium text-white hover:opacity-90 ${busy || !url.trim() ? 'pointer-events-none opacity-40' : ''}`}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {busy ? '正在解析并拉取…' : result ? '重新选择 HAR' : '选择 HAR.json'}
              <input
                type="file"
                accept=".har,.json,application/json"
                className="sr-only"
                disabled={busy || !url.trim()}
                onChange={event => {
                  void handleHarSelection(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </label>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!result ? (
            <div className="flex flex-col items-center px-6 py-16 text-center text-xs text-[var(--color-muted-foreground)]">
              <FileJson className="mb-3 h-8 w-8 opacity-50" />
              选择从飞书页面导出的 HAR.json，系统会自动解析登录态并拉取当前视图。
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)] px-5 py-3">
                <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">
                  已识别 {result.count} 条 · {result.syncMode === 'COOKIE_DIRECT'
                    ? `Cookie 直连 ${result.pageCount} 页`
                    : '浏览器兼容模式'}
                </span>
                <label className="relative ml-auto w-full max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="搜索标题或字段"
                    className={`${inputClass} pl-8`}
                  />
                </label>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {records.map(record => (
                  <article key={record.recordId} className="px-5 py-4 hover:bg-[var(--color-muted)]/25">
                    <div className="flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium">{record.title}</h3>
                        <p className="mt-1 text-[9px] text-[var(--color-muted-foreground)]">{record.recordId}</p>
                        <dl className="mt-2 grid gap-x-4 gap-y-1 text-[10px] sm:grid-cols-2">
                          {Object.entries(record.fields).slice(0, 6).map(([key, value]) => (
                            <div key={key} className="flex min-w-0 gap-1.5">
                              <dt className="shrink-0 text-[var(--color-muted-foreground)]">{key}</dt>
                              <dd className="truncate">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelect(record, result.sourceUrl)}
                        className="shrink-0 border border-[#3370ff]/40 px-3 py-1.5 text-xs font-medium text-[#3370ff] hover:bg-[#3370ff]/10"
                      >
                        带入 PRD
                      </button>
                    </div>
                  </article>
                ))}
                {records.length === 0 && (
                  <p className="px-6 py-12 text-center text-xs text-[var(--color-muted-foreground)]">没有匹配的需求</p>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

const inputClass =
  'w-full border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-xs outline-none focus:border-[var(--color-ring)]'

interface ParsedFeishuHar {
  cookie: string
  recordsUrl: string
  sourceUrl?: string
}

interface HarRequest {
  url?: unknown
  headers?: unknown
  cookies?: unknown
}

interface HarEntry {
  request?: HarRequest
}

function parseFeishuHar(text: string): ParsedFeishuHar {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    throw new Error('文件不是有效的 HAR JSON')
  }

  const entries = getHarEntries(document)
  const recordsEntries = entries.filter(entry => {
    const requestUrl = getRequestUrl(entry.request)
    return requestUrl !== null
      && isFeishuUrl(requestUrl)
      && requestUrl.pathname.includes('/space/api/v1/bitable/')
      && requestUrl.pathname.endsWith('/records')
  })
  const recordsEntry = recordsEntries.find(entry =>
    entry.request ? Boolean(getCookieHeader(entry.request)) : false)
    ?? recordsEntries[0]
  if (!recordsEntry?.request) {
    throw new Error('HAR 中没有找到飞书多维表格的 records 请求，请在表格加载完成后重新导出')
  }

  const cookie = getCookieHeader(recordsEntry.request)
  if (!cookie) {
    throw new Error('records 请求中没有 Cookie；请导出“包含敏感数据”的 HAR')
  }

  const recordsUrl = getRequestUrl(recordsEntry.request)
  const tableId = recordsUrl?.searchParams.get('tableId') ?? recordsUrl?.searchParams.get('tableID')
  const sourceEntry = entries.find(entry => {
    const candidate = getRequestUrl(entry.request)
    if (candidate === null || !isFeishuUrl(candidate)) return false
    if (!candidate.pathname.startsWith('/wiki/') && !candidate.pathname.startsWith('/base/')) return false
    return candidate.searchParams.has('table')
      && (!tableId || candidate.searchParams.get('table') === tableId)
  })

  return {
    cookie,
    recordsUrl: recordsUrl!.toString(),
    sourceUrl: getRequestUrl(sourceEntry?.request)?.toString(),
  }
}

function getHarEntries(document: unknown): HarEntry[] {
  if (!document || typeof document !== 'object') {
    throw new Error('HAR 文件结构无效')
  }
  const log = (document as { log?: unknown }).log
  if (!log || typeof log !== 'object') {
    throw new Error('HAR 文件缺少 log')
  }
  const entries = (log as { entries?: unknown }).entries
  if (!Array.isArray(entries)) {
    throw new Error('HAR 文件缺少请求记录')
  }
  return entries as HarEntry[]
}

function getRequestUrl(request: HarRequest | undefined): URL | null {
  if (typeof request?.url !== 'string') return null
  try {
    return new URL(request.url)
  } catch {
    return null
  }
}

function isFeishuUrl(url: URL) {
  return url.protocol === 'https:'
    && (url.hostname === 'feishu.cn' || url.hostname.endsWith('.feishu.cn'))
}

function getCookieHeader(request: HarRequest): string {
  if (Array.isArray(request.headers)) {
    const header = request.headers.find(item =>
      item
      && typeof item === 'object'
      && typeof (item as { name?: unknown }).name === 'string'
      && (item as { name: string }).name.toLowerCase() === 'cookie')
    if (header && typeof (header as { value?: unknown }).value === 'string') {
      return (header as { value: string }).value.trim()
    }
  }

  if (!Array.isArray(request.cookies)) return ''
  return request.cookies
    .flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const name = (item as { name?: unknown }).name
      const value = (item as { value?: unknown }).value
      return typeof name === 'string' && typeof value === 'string'
        ? [`${name}=${value}`]
        : []
    })
    .join('; ')
}
