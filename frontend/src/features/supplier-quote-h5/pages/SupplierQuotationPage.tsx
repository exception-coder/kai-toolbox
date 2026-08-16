import { useEffect, useMemo, useState } from 'react'
import { Check, CheckCircle2, Clock3, Copy, FileCheck2, FileText, Printer, RotateCcw, Save, Send } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { H5Frame } from '../components/H5Frame'
import { FieldShell, H5Textarea } from '../components/FormField'
import { QuoteLineCard, type QuoteLineErrors } from '../components/QuoteLineCard'
import { StatePanel } from '../components/StatePanel'
import {
  asGatewayError,
  createIdempotencyKey,
  type GatewayError,
  type QuotationAccess,
  type QuotationLineDraft,
  type SubmissionReceipt,
  type SupplierQuoteGateway,
} from '../api/contract'
import { cn } from '@/lib/utils'

interface QuotationPageProps {
  gateway: SupplierQuoteGateway
  brandName: string
  buildPath: (path: string) => string
}

interface DraftState {
  lines: QuotationLineDraft[]
  overallRemark: string
  draftVersion: number
}

const COMMON_CLAUSES = [
  '含13%增值税专用发票',
  '供方负责运费送至指定仓库',
  '验收合格后按约定账期结算',
  '报价自提交之日起 30 天内有效',
]

export function SupplierQuotationPage(props: QuotationPageProps) {
  const { quoteTicket = '' } = useParams<{ quoteTicket: string }>()
  const quotation = useQuotation(props.gateway, quoteTicket)

  return (
    <H5Frame
      brandName={props.brandName}
      currentStep={2}
      badge="供应商报价协同"
      title={quotation.access?.title ? `${quotation.access.title} · 报价单` : '供应商报价单'}
      description="请核对物料明细并填写含税单价与交期。保存草稿仅本地暂存，点击确认提交后采购方方可接收审核。"
    >
      {quotation.loading && (
        <StatePanel
          tone="loading"
          contextTag="核验中"
          title="正在加载询价单数据"
          description="正在核验专属报价凭证及物料清单，请稍候…"
        />
      )}
      {quotation.error && (
        <QuotationError error={quotation.error} buildPath={props.buildPath} onRetry={quotation.reload} />
      )}
      {quotation.access && (
        <QuotationWorkspace gateway={props.gateway} ticket={quoteTicket} initial={quotation.access} />
      )}
    </H5Frame>
  )
}
function QuotationWorkspace({
  gateway,
  ticket,
  initial,
}: {
  gateway: SupplierQuoteGateway
  ticket: string
  initial: QuotationAccess
}) {
  const confirm = useConfirm()
  const [access, setAccess] = useState(initial)
  const [draft, setDraft] = useState<DraftState>(() => toDraftState(initial))
  const [errors, setErrors] = useState<Record<string, QuoteLineErrors>>({})
  const [busy, setBusy] = useState<'saving' | 'submitting' | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null)
  const total = useMemo(() => estimateTotal(access, draft.lines), [access, draft.lines])

  const completedCount = useMemo(() => {
    return draft.lines.filter(
      line =>
        Number(line.unitPrice) > 0 &&
        line.taxRate !== '' &&
        Number(line.deliveryDays) > 0 &&
        Number(line.moq) > 0,
    ).length
  }, [draft.lines])

  const updateLine = (itemId: string, field: keyof QuotationLineDraft, value: string | number | null) => {
    setDraft(current => ({
      ...current,
      lines: current.lines.map(line => (line.itemId === itemId ? { ...line, [field]: value } : line)),
    }))
    setErrors(current => ({ ...current, [itemId]: { ...current[itemId], [field]: undefined } }))
    setNotice(null)
  }

  const handleToggleClause = (clause: string) => {
    if (!access.editable || busy !== null) return
    setDraft(current => {
      const existing = current.overallRemark ? current.overallRemark.trim() : ''
      if (existing.includes(clause)) {
        // remove clause
        const cleaned = existing
          .split('；')
          .filter(part => part.trim() !== clause)
          .join('；')
        return { ...current, overallRemark: cleaned }
      }
      const updated = existing ? `${existing}；${clause}` : clause
      return { ...current, overallRemark: updated }
    })
  }

  const save = async () => {
    const validation = validateQuote(draft.lines)
    if (hasErrors(validation)) return setErrors(validation)
    setBusy('saving')
    setNotice(null)
    try {
      const saved = await gateway.saveDraft(ticket, toRequest(draft))
      setDraft(current => ({ ...current, draftVersion: saved.draftVersion }))
      setNotice({ tone: 'success', message: `草稿已于 ${formatTime(saved.savedAt)} 保存成功（版本 v${saved.draftVersion}）` })
    } catch (error) {
      setNotice({ tone: 'error', message: asGatewayError(error).message })
    } finally {
      setBusy(null)
    }
  }

  const submit = async () => {
    const validation = validateQuote(draft.lines)
    if (hasErrors(validation)) {
      setErrors(validation)
      setNotice({ tone: 'error', message: '请完善标红的必填报价明细后再提交' })
      return
    }
    const accepted = await confirm({
      title: '确认提交正式报价？',
      description: `确认向采购方提交 ${draft.lines.length} 项物料报价，预估含税总额为 ¥ ${formatMoney(total)}。提交后单据将被锁定为只读状态。`,
      confirmText: '确认提交',
      cancelText: '再检查一下',
    })
    if (!accepted) return
    setBusy('submitting')
    setNotice(null)
    try {
      const submitted = await gateway.submitQuotation(ticket, toRequest(draft))
      setReceipt(submitted)
      setAccess(current => ({
        ...current,
        status: 'SUBMITTED',
        editable: false,
        submittedAt: submitted.submittedAt,
        erpSyncStatus: submitted.erpSyncStatus,
      }))
    } catch (error) {
      setNotice({ tone: 'error', message: asGatewayError(error).message })
    } finally {
      setBusy(null)
    }
  }

  if (receipt) {
    return (
      <SubmissionSuccess
        access={access}
        receipt={receipt}
        total={total}
        itemCount={draft.lines.length}
        lines={draft.lines}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Quotation Header & Overview Section */}
      <QuotationHeader
        access={access}
        total={total}
        completedCount={completedCount}
        totalCount={access.items.length}
      />

      {/* Materials List Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-0.5 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-800">物料报价明细 ({access.items.length})</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">已填写 {completedCount}/{access.items.length}</span>
          </div>
          <span>币种：人民币 (CNY)</span>
        </div>

        {access.items.map((item, index) => (
          <QuoteLineCard
            key={item.itemId}
            index={index}
            item={item}
            value={draft.lines.find(line => line.itemId === item.itemId) ?? item.draft}
            errors={errors[item.itemId] ?? {}}
            disabled={!access.editable || busy !== null}
            onChange={(field, value) => updateLine(item.itemId, field, value)}
          />
        ))}
      </section>

      {/* Overall Remarks Section */}
      <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs sm:p-5">
        <div className="space-y-2">
          <FieldShell
            label="整单商务说明"
            htmlFor="quotation-overall-remark"
            hint={`${draft.overallRemark.length}/500`}
          >
            <H5Textarea
              id="quotation-overall-remark"
              value={draft.overallRemark}
              maxLength={500}
              disabled={!access.editable || busy !== null}
              placeholder="可补充报价有效期、结算方式、交货地点、运费说明或其他商务条款…"
              onChange={event => setDraft(current => ({ ...current, overallRemark: event.target.value }))}
            />
          </FieldShell>

          {access.editable && (
            <div className="pt-1">
              <span className="text-[11px] text-slate-400">快捷商务条款（点击快速插入/移除）：</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {COMMON_CLAUSES.map(clause => {
                  const active = draft.overallRemark.includes(clause)
                  return (
                    <button
                      key={clause}
                      type="button"
                      className={cn(
                        'rounded-md border px-2 py-1 text-xs transition-colors',
                        active
                          ? 'border-slate-900 bg-slate-900 text-white font-medium'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100',
                      )}
                      onClick={() => handleToggleClause(clause)}
                    >
                      {active ? `✓ ${clause}` : `+ ${clause}`}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Real-time Notice banner */}
      {notice && <Notice tone={notice.tone}>{notice.message}</Notice>}

      {/* Bottom Actions */}
      {access.editable ? (
        <ActionBar
          busy={busy}
          total={total}
          completedCount={completedCount}
          totalCount={access.items.length}
          onSave={save}
          onSubmit={submit}
        />
      ) : (
        <ReadOnlyNotice access={access} />
      )}
    </div>
  )
}

function QuotationHeader({
  access,
  total,
  completedCount,
  totalCount,
}: {
  access: QuotationAccess
  total: number
  completedCount: number
  totalCount: number
}) {
  const [copied, setCopied] = useState(false)
  const status = statusPresentation(access.status)

  const handleCopyNo = async () => {
    try {
      await navigator.clipboard.writeText(access.requestNo)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs sm:p-5">
      {/* Top row: Status, Request No, and Deadline */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          <button
            type="button"
            className="group inline-flex items-center gap-1 font-mono text-xs text-slate-600 hover:text-slate-900 transition-colors"
            title="点击复制询价单号"
            onClick={handleCopyNo}
          >
            <span>{access.requestNo}</span>
            {copied ? (
              <Check className="size-3 text-emerald-600" />
            ) : (
              <Copy className="size-3 text-slate-400 opacity-60 group-hover:opacity-100" />
            )}
          </button>
        </div>

        <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <Clock3 aria-hidden="true" className="size-3.5 text-slate-400" />
          <span>截止 {formatDateTime(access.deadline)}</span>
        </div>
      </div>

      {/* Grid metadata */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <span className="text-slate-400">采购单位：</span>
          <p className="mt-0.5 font-medium text-slate-800">{access.buyerName}</p>
        </div>
        <div>
          <span className="text-slate-400">报价供应商：</span>
          <p className="mt-0.5 font-medium text-slate-800 truncate" title={access.supplierName}>
            {access.supplierName}
          </p>
        </div>
        <div>
          <span className="text-slate-400">业务联系人：</span>
          <p className="mt-0.5 font-medium text-slate-800">{access.contactName}</p>
        </div>
        <div>
          <span className="text-slate-400">报价币种：</span>
          <p className="mt-0.5 font-medium text-slate-800">{access.currency} · 含税</p>
        </div>
      </div>

      {/* Summary strip with grand total and progress */}
      <div className="mt-3.5 flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <FileCheck2 aria-hidden="true" className="size-4 text-slate-500" />
          <div className="text-xs">
            <span className="text-slate-600 font-medium">预估含税总额</span>
            <span className="ml-2 text-[11px] text-slate-400">
              ({completedCount}/{totalCount} 项已填写)
            </span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-base font-bold tabular-nums text-slate-900 sm:text-lg">
            ¥ {formatMoney(total)}
          </span>
        </div>
      </div>
    </section>
  )
}

function ActionBar({
  busy,
  total,
  completedCount,
  totalCount,
  onSave,
  onSubmit,
}: {
  busy: 'saving' | 'submitting' | null
  total: number
  completedCount: number
  totalCount: number
  onSave: () => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/90 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg shadow-slate-900/5 backdrop-blur-md sm:static sm:flex sm:items-center sm:justify-between sm:rounded-xl sm:border sm:p-3 sm:pb-3 sm:shadow-xs">
      <div className="mb-2.5 flex items-baseline justify-between sm:mb-0 sm:block">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span>预估总额</span>
          <span className="text-[11px] text-slate-400">({completedCount}/{totalCount}项)</span>
        </div>
        <span className="text-base font-bold tabular-nums text-slate-900 sm:text-lg">
          ¥ {formatMoney(total)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2.5">
        <Button
          variant="outline"
          disabled={busy !== null}
          className="h-10 rounded-lg border-slate-200 px-4 text-xs font-medium text-slate-700 hover:bg-slate-50"
          onClick={onSave}
        >
          <Save aria-hidden="true" className="mr-1.5 size-3.5 text-slate-500" />
          {busy === 'saving' ? '保存中…' : '保存草稿'}
        </Button>
        <Button
          disabled={busy !== null}
          className="h-10 rounded-lg bg-slate-900 px-5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
          onClick={onSubmit}
        >
          <Send aria-hidden="true" className="mr-1.5 size-3.5" />
          {busy === 'submitting' ? '提交中…' : '确认提交'}
        </Button>
      </div>
    </div>
  )
}

function SubmissionSuccess({
  access,
  receipt,
  total,
  itemCount,
  lines,
}: {
  access: QuotationAccess
  receipt: SubmissionReceipt
  total: number
  itemCount: number
  lines: QuotationLineDraft[]
}) {
  const [copiedSummary, setCopiedSummary] = useState(false)

  const handleCopySummary = async () => {
    const linesText = access.items
      .map((item, index) => {
        const line = lines.find(l => l.itemId === item.itemId)
        return `  ${index + 1}. ${item.materialName} (${item.materialCode})：单价 ¥${line?.unitPrice || 0}/${item.unit}，交期 ${line?.deliveryDays || 0}天`
      })
      .join('\n')

    const summaryText = `【供应商报价单已提交】\n询价单号：${receipt.requestNo}\n报价企业：${access.supplierName}\n联系人：${access.contactName}\n预估含税总额：¥ ${formatMoney(total)}\n物料明细：\n${linesText}\n提交时间：${formatDateTime(receipt.submittedAt)}`

    try {
      await navigator.clipboard.writeText(summaryText)
      setCopiedSummary(true)
      setTimeout(() => setCopiedSummary(false), 2000)
    } catch {
      // fallback
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <StatePanel
      tone="success"
      contextTag="提交已完成"
      title="报价单已成功提交至采购方"
      description="采购方协同系统已接收您的报价信息。数据已生成防篡改凭据，请勿重复提交。"
      extra={
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200/80 bg-slate-50 p-4 text-left text-xs">
            <Summary label="询价单号" value={receipt.requestNo} />
            <Summary label="提交时间" value={formatDateTime(receipt.submittedAt)} />
            <Summary label="报价项数" value={`${itemCount} 项物料`} />
            <Summary label="预估总额" value={`¥ ${formatMoney(total)} (含税)`} />
            <Summary label="报价企业" value={access.supplierName} />
            <Summary
              label="ERP同步状态"
              value={receipt.erpSyncStatus === 'SYNCED' ? '已入库同步' : '待采购员复核'}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-9 rounded-lg border-slate-200 px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              onClick={handleCopySummary}
            >
              {copiedSummary ? (
                <Check className="mr-1.5 size-3.5 text-emerald-600" />
              ) : (
                <Copy className="mr-1.5 size-3.5 text-slate-500" />
              )}
              {copiedSummary ? '已复制微信摘要' : '复制微信报价摘要'}
            </Button>
            <Button
              variant="outline"
              className="h-9 rounded-lg border-slate-200 px-3.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
              onClick={handlePrint}
            >
              <Printer className="mr-1.5 size-3.5 text-slate-500" />
              打印 / 存为凭证
            </Button>
          </div>
        </div>
      }
    />
  )
}

function QuotationError({
  error,
  buildPath,
  onRetry,
}: {
  error: GatewayError
  buildPath: (path: string) => string
  onRetry: () => void
}) {
  const navigate = useNavigate()

  if (error.errorCode === 'SCM_BINDING_REQUIRED' || error.errorCode === 'REGISTRATION_REQUIRED') {
    const returnPath = String(error.details.returnPath ?? '/q/demo-quote')
    return (
      <StatePanel
        tone="warning"
        contextTag="需账号关联"
        title="需要先关联 SCM 供应商账号"
        description="当前微信尚未关联 SCM 账号。首次登录校验成功后即可返回当前报价单，后续无需重复登录。"
        metaTrace={`错误代码: ${error.errorCode}`}
        action={{
          label: '立即关联 SCM 账号',
          onClick: () => navigate(`${buildPath('/bind-scm')}?returnTo=${encodeURIComponent(returnPath)}`),
        }}
      />
    )
  }

  const retryable = error.errorCode === 'NETWORK_ERROR'
  return (
    <StatePanel
      tone={retryable ? 'error' : 'warning'}
      contextTag="单据异常"
      title="无法打开当前报价单"
      description={error.message || '该报价单可能已过期、被采购方撤回或您没有访问权限。'}
      metaTrace={`错误代码: ${error.errorCode} · 状态: ${error.status}`}
      action={retryable ? { label: '重新加载', onClick: onRetry } : undefined}
      secondaryAction={{
        label: '返回系统首页',
        onClick: () => navigate('/'),
      }}
    />
  )
}

function useQuotation(gateway: SupplierQuoteGateway, ticket: string) {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<{ loading: boolean; access: QuotationAccess | null; error: GatewayError | null }>({
    loading: true,
    access: null,
    error: null,
  })

  useEffect(() => {
    const controller = new AbortController()
    setState({ loading: true, access: null, error: null })
    gateway
      .getQuotationAccess(ticket, controller.signal)
      .then(access => setState({ loading: false, access, error: null }))
      .catch(error => {
        const normalized = asGatewayError(error)
        if (normalized.errorCode !== 'REQUEST_ABORTED') setState({ loading: false, access: null, error: normalized })
      })
    return () => controller.abort()
  }, [gateway, ticket, reloadKey])

  return { ...state, reload: () => setReloadKey(value => value + 1) }
}

function validateQuote(lines: QuotationLineDraft[]): Record<string, QuoteLineErrors> {
  const result: Record<string, QuoteLineErrors> = {}
  const moneyPattern = /^\d+(\.\d{1,4})?$/
  const percentPattern = /^\d+(\.\d{1,2})?$/

  for (const line of lines) {
    const errors: QuoteLineErrors = {}
    if (!moneyPattern.test(line.unitPrice) || Number(line.unitPrice) <= 0) errors.unitPrice = '请输入有效价格'
    if (!percentPattern.test(line.taxRate) || Number(line.taxRate) > 100) errors.taxRate = '请输入 0~100 的税率'
    if (!Number.isInteger(line.deliveryDays) || Number(line.deliveryDays) <= 0) errors.deliveryDays = '请输入交期天数'
    if (!moneyPattern.test(line.moq) || Number(line.moq) <= 0) errors.moq = '请输入起订量'
    if (Object.keys(errors).length > 0) result[line.itemId] = errors
  }
  return result
}

function toDraftState(access: QuotationAccess): DraftState {
  return {
    lines: access.items.map(item => ({ ...item.draft })),
    overallRemark: access.overallRemark,
    draftVersion: access.draftVersion,
  }
}

function toRequest(draft: DraftState) {
  return {
    items: draft.lines,
    overallRemark: draft.overallRemark,
    draftVersion: draft.draftVersion,
    idempotencyKey: createIdempotencyKey(),
  }
}

function estimateTotal(access: QuotationAccess, lines: QuotationLineDraft[]): number {
  return access.items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(lines.find(line => line.itemId === item.itemId)?.unitPrice || 0),
    0,
  )
}

function hasErrors(errors: Record<string, QuoteLineErrors>) {
  return Object.keys(errors).length > 0
}

function formatMoney(value: number) {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
    new Date(value),
  )
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function statusPresentation(
  status: QuotationAccess['status'],
): { label: string; tone: 'info' | 'success' | 'warning' | 'neutral' } {
  if (status === 'SUBMITTED') return { label: '已提交', tone: 'success' }
  if (status === 'CLOSED') return { label: '已截止', tone: 'warning' }
  if (status === 'CANCELLED') return { label: '已撤销', tone: 'neutral' }
  return { label: '报价中', tone: 'info' }
}

function Notice({ tone, children }: { tone: 'success' | 'error'; children: string }) {
  return (
    <div
      role="status"
      className={cn(
        'rounded-lg px-3.5 py-2.5 text-xs font-medium transition-all',
        tone === 'success'
          ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border border-rose-200 bg-rose-50 text-rose-800',
      )}
    >
      {children}
    </div>
  )
}

function ReadOnlyNotice({ access }: { access: QuotationAccess }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800">
      <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />
      <span>
        {access.status === 'SUBMITTED'
          ? `该报价单已于 ${formatDateTime(access.submittedAt ?? '')} 成功提交，当前处于只读归档状态。`
          : '当前询价单不可编辑。'}
      </span>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-400">{label}：</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  )
}
