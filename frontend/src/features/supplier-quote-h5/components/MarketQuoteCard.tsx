import { Check, ChevronRight, History, RotateCcw } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { MarketQuoteItem, MarketQuotePriceInput } from "../api/contract";

interface MarketQuoteCardProps {
  item: MarketQuoteItem;
  selected: boolean;
  draft: MarketQuotePriceInput;
  disabled: boolean;
  errors: Partial<Record<"priceIncludeTax" | "priceExcludeTax", string>>;
  onDraftChange: (
    field: "priceIncludeTax" | "priceExcludeTax",
    value: string,
  ) => void;
  onQuality: () => void;
  onUseLast: () => void;
  onRevoke: () => void;
}

export function MarketQuoteCard({
  item,
  selected,
  draft,
  disabled,
  errors,
  onDraftChange,
  onQuality,
  onUseLast,
  onRevoke,
}: MarketQuoteCardProps) {
  const presentation = statusPresentation(item.status);
  return (
    <article
      className={cn(
        "rounded-[14px] border border-slate-900/[0.06] bg-white p-4 transition-colors duration-150",
        selected && "border-slate-300 bg-slate-50/40",
      )}
    >
      <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-5 text-slate-900">
                {item.productName}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {item.productCode} · {item.colorCode} · {item.colorName} · {item.colorGrade}
                {item.certification ? ` · ${item.certification}` : ""}
              </p>
            </div>
            <StatusBadge dot={false} tone={presentation.tone} className="shrink-0 rounded-full px-2.5 py-1 text-[11px]">
              {presentation.checked && <Check className="size-3 stroke-[2.5]" />}
              {presentation.label}
            </StatusBadge>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <History className="size-3.5" />
            <span>上次报价</span>
            <PriceMeta label="含税" value={item.lastPriceIncludeTax} />
            <span className="text-slate-300">/</span>
            <PriceMeta label="未税" value={item.lastPriceExcludeTax} />
            {item.canQuote && (item.lastPriceIncludeTax || item.lastPriceExcludeTax) && (
              <button
                type="button"
                disabled={disabled}
                className="ml-auto min-h-8 font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
                onClick={onUseLast}
              >
                沿用上次
              </button>
            )}
          </div>

          {item.auditReason && (
            <div className="mt-3 border-l-2 border-amber-400 pl-3 text-xs leading-5 text-amber-900">
              <span className="font-medium">审核意见：</span>
              {item.auditReason}
            </div>
          )}

          {item.canQuote && (
            <div className="mt-4 grid grid-cols-2 gap-3" aria-label="本次报价">
              <PriceInput
                label="本次含税价"
                value={draft.priceIncludeTax}
                error={errors.priceIncludeTax}
                disabled={disabled}
                onChange={(value) => onDraftChange("priceIncludeTax", value)}
              />
              <PriceInput
                label="本次不含税价"
                value={draft.priceExcludeTax}
                error={errors.priceExcludeTax}
                disabled={disabled}
                onChange={(value) => onDraftChange("priceExcludeTax", value)}
              />
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
              onClick={onQuality}
            >
              规格与质量要求
              <ChevronRight className="size-3.5" />
            </button>
            {item.canRevoke && (
              <button
                type="button"
                disabled={disabled}
                className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-rose-700 disabled:opacity-50"
                onClick={onRevoke}
              >
                <RotateCcw className="size-3.5" />
                撤销报价
              </button>
            )}
          </div>
      </div>
    </article>
  );
}

function PriceMeta({ label, value }: { label: string; value: string | null }) {
  return <span className="tabular-nums"><span className="text-slate-400">{label}</span> {value ? `¥${value}` : "暂无"}</span>;
}

function PriceInput({
  label,
  value,
  error,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs text-slate-600">
      <span className="font-medium">{label}</span>
      <span className="relative mt-1.5 block">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          ¥
        </span>
        <input
          inputMode="decimal"
          value={value}
          disabled={disabled}
          placeholder="0.00"
          className={cn(
            "h-10 w-full rounded-lg border bg-white pl-7 pr-10 text-sm tabular-nums outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200",
            error ? "border-rose-400" : "border-slate-200",
          )}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
          /kg
        </span>
      </span>
      {error && (
        <span className="mt-1 block text-[11px] text-rose-600">{error}</span>
      )}
    </label>
  );
}

function statusPresentation(status: MarketQuoteItem["status"]): {
  label: string;
  tone: "info" | "success" | "warning" | "neutral";
  checked?: boolean;
} {
  if (status === "PENDING_AUDIT") return { label: "待审核", tone: "info" };
  if (status === "APPROVED") return { label: "已通过", tone: "success", checked: true };
  if (status === "REJECTED_VOID")
    return { label: "已拒绝", tone: "neutral" };
  if (status === "REQUOTE") return { label: "待重报", tone: "warning" };
  return { label: "待报价", tone: "warning" };
}
