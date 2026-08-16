import { useState } from 'react'
import { Check, Copy, Sparkles } from 'lucide-react'
import { FieldShell, H5Input } from './FormField'
import type { QuotationItem, QuotationLineDraft } from '../api/contract'
import { cn } from '@/lib/utils'

export type QuoteLineErrors = Partial<Record<keyof QuotationLineDraft, string>>

interface QuoteLineCardProps {
  index: number
  item: QuotationItem
  value: QuotationLineDraft
  errors: QuoteLineErrors
  disabled: boolean
  onChange: (field: keyof QuotationLineDraft, value: string | number | null) => void
}

const TAX_PRESETS = ['13', '9', '6', '0']
const DELIVERY_PRESETS = [7, 15, 30]
const REMARK_PRESETS = ['含税含运', '出厂自提', '支持打样', '标准包材']

export function QuoteLineCard({ index, item, value, errors, disabled, onChange }: QuoteLineCardProps) {
  const [copied, setCopied] = useState(false)
  const lineSubtotal = Number(value.unitPrice) > 0 ? Number(value.unitPrice) * Number(item.quantity) : null
  const isComplete =
    Number(value.unitPrice) > 0 &&
    value.taxRate !== '' &&
    Number(value.deliveryDays) > 0 &&
    Number(value.moq) > 0

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(item.materialCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // fallback ignore
    }
  }

  const handleApplyRemark = (preset: string) => {
    if (disabled) return
    const current = value.remark ? value.remark.trim() : ''
    if (current.includes(preset)) return
    const updated = current ? `${current}；${preset}` : preset
    onChange('remark', updated)
  }

  return (
    <article
      className={cn(
        'rounded-xl border bg-white shadow-xs transition-colors',
        isComplete ? 'border-slate-200/90' : 'border-slate-200',
      )}
    >
      {/* Header with material info and required quantity */}
      <div className="border-b border-slate-100 bg-slate-50/70 p-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded bg-slate-200/80 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                #{index + 1}
              </span>
              <button
                type="button"
                className="group inline-flex items-center gap-1 font-mono text-xs text-slate-500 hover:text-slate-900 transition-colors"
                title="点击复制物料编码"
                onClick={handleCopyCode}
              >
                <span>{item.materialCode}</span>
                {copied ? (
                  <Check className="size-3 text-emerald-600" />
                ) : (
                  <Copy className="size-3 text-slate-400 opacity-60 group-hover:opacity-100" />
                )}
              </button>
              {isComplete ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200/60">
                  <Check className="size-2.5" /> 已完善
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200/60">
                  待报价
                </span>
              )}
            </div>

            <h3 className="mt-1.5 text-sm font-semibold text-slate-900 sm:text-base">{item.materialName}</h3>
            <p className="mt-0.5 text-xs text-slate-500 leading-normal">{item.specification}</p>
          </div>

          <div className="shrink-0 text-right">
            <span className="text-[11px] text-slate-400">询价数量</span>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900 sm:text-base">
              {Number(item.quantity).toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-500">{item.unit}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Inputs form section */}
      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Price */}
          <FieldShell
            label="含税单价"
            htmlFor={`${item.itemId}-price`}
            required
            error={errors.unitPrice}
            hint="精确至4位小数"
          >
            <H5Input
              id={`${item.itemId}-price`}
              inputMode="decimal"
              prefixNode="¥"
              hasError={Boolean(errors.unitPrice)}
              value={value.unitPrice}
              disabled={disabled}
              placeholder="0.0000"
              onChange={event => onChange('unitPrice', event.target.value)}
            />
          </FieldShell>

          {/* Tax Rate */}
          <FieldShell label="税率" htmlFor={`${item.itemId}-tax`} required error={errors.taxRate}>
            <H5Input
              id={`${item.itemId}-tax`}
              inputMode="decimal"
              suffix="%"
              hasError={Boolean(errors.taxRate)}
              value={value.taxRate}
              disabled={disabled}
              placeholder="13"
              onChange={event => onChange('taxRate', event.target.value)}
            />
            {!disabled && (
              <div className="flex flex-wrap gap-1 pt-1">
                {TAX_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                      value.taxRate === preset
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                    onClick={() => onChange('taxRate', preset)}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            )}
          </FieldShell>

          {/* Delivery Days */}
          <FieldShell label="交期" htmlFor={`${item.itemId}-delivery`} required error={errors.deliveryDays}>
            <H5Input
              id={`${item.itemId}-delivery`}
              inputMode="numeric"
              suffix="天"
              hasError={Boolean(errors.deliveryDays)}
              value={value.deliveryDays ?? ''}
              disabled={disabled}
              placeholder="15"
              onChange={event => onChange('deliveryDays', event.target.value ? Number(event.target.value) : null)}
            />
            {!disabled && (
              <div className="flex flex-wrap gap-1 pt-1">
                {DELIVERY_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                      value.deliveryDays === preset
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                    onClick={() => onChange('deliveryDays', preset)}
                  >
                    {preset}天
                  </button>
                ))}
              </div>
            )}
          </FieldShell>

          {/* MOQ */}
          <FieldShell label="起订量 (MOQ)" htmlFor={`${item.itemId}-moq`} required error={errors.moq}>
            <H5Input
              id={`${item.itemId}-moq`}
              inputMode="decimal"
              suffix={item.unit}
              hasError={Boolean(errors.moq)}
              value={value.moq}
              disabled={disabled}
              placeholder="1000"
              onChange={event => onChange('moq', event.target.value)}
            />
            {!disabled && (
              <div className="flex flex-wrap gap-1 pt-1">
                <button
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                    value.moq === item.quantity
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                  onClick={() => onChange('moq', item.quantity)}
                >
                  <Sparkles className="size-2.5" />
                  同询价量 ({item.quantity})
                </button>
              </div>
            )}
          </FieldShell>
        </div>

        {/* Remark & presets */}
        <div className="space-y-1.5">
          <FieldShell label="明细备注" htmlFor={`${item.itemId}-remark`} hint="选填，最多200字">
            <H5Input
              id={`${item.itemId}-remark`}
              value={value.remark}
              disabled={disabled}
              maxLength={200}
              placeholder="如：含运费、特定包装要求、溢短装范围等"
              onChange={event => onChange('remark', event.target.value)}
            />
          </FieldShell>

          {!disabled && (
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
              <span className="text-[10px]">常用项:</span>
              {REMARK_PRESETS.map(preset => (
                <button
                  key={preset}
                  type="button"
                  className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 hover:border-slate-300 hover:bg-slate-100 transition-colors"
                  onClick={() => handleApplyRemark(preset)}
                >
                  + {preset}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Subtotal calculation display */}
        {lineSubtotal !== null && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
            <span className="text-slate-400">
              计算公式：¥{value.unitPrice} × {Number(item.quantity).toLocaleString()} {item.unit}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">预估小计:</span>
              <span className="text-sm font-bold tabular-nums text-slate-900">
                ¥ {lineSubtotal.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}
