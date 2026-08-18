import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CopyCheck, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { H5Frame } from "../components/H5Frame";
import { MarketQuoteCard } from "../components/MarketQuoteCard";
import { QualityStandardsSheet } from "../components/QualityStandardsSheet";
import { StatePanel } from "../components/StatePanel";
import {
  asGatewayError,
  type MarketQuoteItem,
  type MarketQuotePriceInput,
  type SupplierQuoteGateway,
} from "../api/contract";

interface SupplierQuotationPageProps {
  gateway: SupplierQuoteGateway;
  brandName: string;
}
type DraftErrors = Record<
  string,
  Partial<Record<"priceIncludeTax" | "priceExcludeTax", string>>
>;
type QuoteViewTab = "PENDING" | "PENDING_AUDIT" | "APPROVED" | "REJECTED" | "REQUOTE";

const QUOTE_VIEW_TABS: ReadonlyArray<{ value: QuoteViewTab; label: string }> = [
  { value: "PENDING", label: "待报价" },
  { value: "PENDING_AUDIT", label: "待审核" },
  { value: "APPROVED", label: "已通过" },
  { value: "REJECTED", label: "已拒绝" },
  { value: "REQUOTE", label: "待重报" },
];

export function SupplierQuotationPage({
  gateway,
  brandName,
}: SupplierQuotationPageProps) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<QuoteViewTab>("PENDING");
  const [items, setItems] = useState<MarketQuoteItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [quoteTaskCount, setQuoteTaskCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, MarketQuotePriceInput>>(
    {},
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [qualityItem, setQualityItem] = useState<MarketQuoteItem | null>(null);

  const load = useCallback(() => setReloadKey((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    gateway.getMarketQuotePage(
      { pageNo: 1, pageSize: 50, tab: "ALL", productName: "", status: "" },
      controller.signal,
    )
      .then((page) => {
        const sortedItems = sortQuoteItems(page.items);
        const counts = countByView(sortedItems);
        setItems(sortedItems);
        setTotalCount(page.total);
        setQuoteTaskCount(page.pendingCount);
        setTab((current) => counts[current] > 0 ? current : recommendedView(counts));
        setLoading(false);
      })
      .catch((cause) => {
        const normalized = asGatewayError(cause);
        if (normalized.errorCode !== "REQUEST_ABORTED") {
          setError(normalized.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [gateway, reloadKey]);

  const tabCounts = useMemo(() => countByView(items), [items]);
  const visibleItems = useMemo(
    () => items.filter((item) => matchesView(item, tab)),
    [items, tab],
  );

  const actionableIds = useMemo(
    () => visibleItems.filter((item) => item.canQuote).map((item) => item.supcId),
    [visibleItems],
  );
  const selectedInputs = [...selectedIds].map(
    (id) => drafts[id] ?? emptyDraft(id),
  );
  const progress = totalCount
    ? Math.round((quoteTaskCount / totalCount) * 100)
    : 0;
  const allComplete = totalCount > 0 && quoteTaskCount === 0;

  const updateDraft = (
    id: string,
    field: "priceIncludeTax" | "priceExcludeTax",
    value: string,
  ) => {
    setSelectedIds((current) => new Set(current).add(id));
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? emptyDraft(id)), [field]: value },
    }));
    setErrors((current) => ({
      ...current,
      [id]: { ...current[id], [field]: undefined },
    }));
  };

  const useLastQuote = (item: MarketQuoteItem) => {
    setSelectedIds((current) => new Set(current).add(item.supcId));
    setDrafts((current) => ({
      ...current,
      [item.supcId]: {
        supcId: item.supcId,
        priceIncludeTax: item.lastPriceIncludeTax ?? "",
        priceExcludeTax: item.lastPriceExcludeTax ?? "",
      },
    }));
  };

  const submitSelected = async () => {
    const nextErrors = validateInputs(selectedInputs);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setNotice(
        "请完整填写所选纱线的含税价和不含税价，价格须大于 0 且最多两位小数。",
      );
      return;
    }
    const accepted = await confirm({
      title: selectedInputs.length > 1 ? "确认批量提交报价" : "确认提交报价",
      description: `将提交 ${selectedInputs.length} 条市场报价。提交后进入待审核状态，审核前可撤销。`,
      confirmText: "确认提交",
    });
    if (!accepted) return;
    setBusy(true);
    setNotice("");
    try {
      const result =
        selectedInputs.length === 1
          ? await gateway.submitMarketQuote(selectedInputs[0])
          : await gateway.submitMarketQuotes(selectedInputs);
      setSelectedIds(new Set());
      setDrafts({});
      setErrors({});
      setNotice(
        result.failures.length
          ? `已提交 ${result.succeededIds.length} 条，${result.failures.length} 条失败：${result.failures.map((item) => item.message).join("；")}`
          : `已成功提交 ${result.succeededIds.length} 条报价。`,
      );
      setTab("PENDING_AUDIT");
      load();
    } catch (cause) {
      setNotice(asGatewayError(cause).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (item: MarketQuoteItem) => {
    const accepted = await confirm({
      title: "撤销本次报价",
      description: `${item.productName} · ${item.colorName} 将恢复为待报价状态。`,
      confirmText: "确认撤销",
      variant: "destructive",
    });
    if (!accepted) return;
    setBusy(true);
    try {
      await gateway.revokeMarketQuote(item.supcId);
      setNotice("报价已撤销，可重新填写。");
      setTab("PENDING");
      load();
    } catch (cause) {
      setNotice(asGatewayError(cause).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <H5Frame
      brandName={brandName}
      currentStep={2}
      title="本轮询价"
      description="填写本轮可供价格，核对无误后统一提交给采购方。"
    >
      <section className="rounded-[14px] border border-slate-900/[0.06] bg-white p-4" aria-label="本轮询价进度">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">本轮报价</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              {quoteTaskCount}<span className="text-base font-normal text-slate-400"> / {totalCount}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={allComplete ? "text-xs font-medium text-emerald-700" : "text-xs font-medium text-slate-600"}>
              {allComplete ? "无需报价" : `待报价 ${quoteTaskCount}`}
            </span>
            <button aria-label="刷新报价" className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-900" onClick={load}>
              <RefreshCw className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-label={`本轮需报价 ${progress}%`}>
          <div className="h-full rounded-full bg-slate-900 transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {allComplete ? "当前没有需要填写的报价，可查看本轮报价明细。" : `本轮共 ${quoteTaskCount} 项需要报价，历史价格仅供参考。`}
        </p>
      </section>

      <div className="no-scrollbar mt-4 overflow-x-auto pb-1" role="tablist" aria-label="按报价状态筛选">
        <div className="flex min-w-max gap-2">
          {QUOTE_VIEW_TABS.map(({ value, label }) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              className={tab === value
                ? "min-h-9 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white"
                : "min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-slate-500 ring-1 ring-slate-900/[0.06] hover:text-slate-900"}
              onClick={() => {
                setTab(value);
                setSelectedIds(new Set());
              }}
            >
              {label} {tabCounts[value]}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="my-3 border-l-2 border-slate-900 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-700"
        >
          {notice}
        </div>
      )}
      {loading && (
        <p className="py-12 text-center text-sm text-slate-500">
          正在读取市场报价…
        </p>
      )}
      {!loading && error && (
        <StatePanel
          tone="error"
          contextTag="数据加载失败"
          title="暂时无法获取市场报价"
          description={error}
          action={{ label: "重新加载", onClick: load }}
        />
      )}
      {!loading && !error && items.length === 0 && (
        <StatePanel
          tone="info"
          contextTag="报价待办"
          title="当前没有待报价任务"
          description="采购方发布新的询价任务后，会显示在这里。"
          action={{ label: "刷新", onClick: load }}
        />
      )}
      {!loading && !error && items.length > 0 && visibleItems.length === 0 && (
        <StatePanel
          tone="info"
          contextTag="当前筛选"
          title={`暂无${QUOTE_VIEW_TABS.find((item) => item.value === tab)?.label ?? "对应"}报价`}
          description="可以切换其他状态页签查看本轮报价记录。"
          action={{
            label: "查看其他状态",
            onClick: () => setTab(recommendedView(tabCounts)),
          }}
        />
      )}
      {!loading && !error && visibleItems.length > 0 && (
        <section aria-label="市场报价列表">
          <div className="flex items-center justify-between pb-3 pt-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">报价明细</h2>
              <p className="mt-0.5 text-xs text-slate-500">当前 {visibleItems.length} 项</p>
            </div>
            {actionableIds.some((id) => {
              const item = visibleItems.find((candidate) => candidate.supcId === id);
              return item?.lastPriceIncludeTax && item?.lastPriceExcludeTax;
            }) && (
              <button className="inline-flex min-h-8 items-center gap-1.5 font-medium text-slate-700 hover:text-slate-950" onClick={() => visibleItems.filter((item) => item.canQuote && item.lastPriceIncludeTax && item.lastPriceExcludeTax).forEach(useLastQuote)}>
                <CopyCheck className="size-3.5" />一键沿用上次
              </button>
            )}
          </div>
          <div className="space-y-3">
            {visibleItems.map((item) => (
              <MarketQuoteCard
                key={item.supcId}
                item={item}
                selected={selectedIds.has(item.supcId)}
                draft={drafts[item.supcId] ?? emptyDraft(item.supcId)}
                errors={errors[item.supcId] ?? {}}
                disabled={busy}
                onDraftChange={(field, value) =>
                  updateDraft(item.supcId, field, value)
                }
                onQuality={() => setQualityItem(item)}
                onUseLast={() => useLastQuote(item)}
                onRevoke={() => revoke(item)}
              />
            ))}
          </div>
        </section>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-900">
                <Check className="mr-1 inline size-3.5" />已填写 {selectedIds.size} 项
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                完整填写后统一提交
              </p>
            </div>
            <Button
              disabled={busy}
              className="h-10 rounded-lg bg-slate-900 px-5 text-xs text-white"
              onClick={submitSelected}
            >
              <Send className="mr-1.5 size-3.5" />
              {busy
                ? "提交中…"
                : selectedIds.size > 1
                  ? "批量提交"
                  : "提交报价"}
            </Button>
          </div>
        </div>
      )}
      <QualityStandardsSheet
        gateway={gateway}
        productId={qualityItem?.productId ?? null}
        productName={
          qualityItem
            ? `${qualityItem.productName} · ${qualityItem.colorName}`
            : ""
        }
        onClose={() => setQualityItem(null)}
      />
    </H5Frame>
  );
}

function emptyDraft(supcId: string): MarketQuotePriceInput {
  return { supcId, priceIncludeTax: "", priceExcludeTax: "" };
}
function validateInputs(inputs: MarketQuotePriceInput[]): DraftErrors {
  const result: DraftErrors = {};
  const pattern = /^\d+(\.\d{1,2})?$/;
  for (const input of inputs) {
    const row: DraftErrors[string] = {};
    if (
      !pattern.test(input.priceIncludeTax) ||
      Number(input.priceIncludeTax) <= 0
    )
      row.priceIncludeTax = "请输入大于 0 的两位小数";
    if (
      !pattern.test(input.priceExcludeTax) ||
      Number(input.priceExcludeTax) <= 0
    )
      row.priceExcludeTax = "请输入大于 0 的两位小数";
    if (Object.keys(row).length) result[input.supcId] = row;
  }
  return result;
}

function matchesView(item: MarketQuoteItem, tab: QuoteViewTab): boolean {
  if (tab === "PENDING") return item.status === "PENDING_QUOTE";
  if (tab === "PENDING_AUDIT") return item.status === "PENDING_AUDIT";
  if (tab === "APPROVED") return item.status === "APPROVED";
  if (tab === "REJECTED") return item.status === "REJECTED_VOID";
  return item.status === "REQUOTE";
}

function countByView(items: MarketQuoteItem[]): Record<QuoteViewTab, number> {
  return {
    PENDING: items.filter((item) => matchesView(item, "PENDING")).length,
    PENDING_AUDIT: items.filter((item) => matchesView(item, "PENDING_AUDIT")).length,
    APPROVED: items.filter((item) => matchesView(item, "APPROVED")).length,
    REJECTED: items.filter((item) => matchesView(item, "REJECTED")).length,
    REQUOTE: items.filter((item) => matchesView(item, "REQUOTE")).length,
  };
}

function sortQuoteItems(items: MarketQuoteItem[]): MarketQuoteItem[] {
  const priority: Record<MarketQuoteItem["status"], number> = {
    PENDING_QUOTE: 0,
    REQUOTE: 1,
    PENDING_AUDIT: 2,
    APPROVED: 3,
    REJECTED_VOID: 4,
  };
  return [...items].sort((left, right) => priority[left.status] - priority[right.status]);
}

function recommendedView(counts: Record<QuoteViewTab, number>): QuoteViewTab {
  if (counts.PENDING > 0) return "PENDING";
  if (counts.REQUOTE > 0) return "REQUOTE";
  if (counts.PENDING_AUDIT > 0) return "PENDING_AUDIT";
  if (counts.APPROVED > 0) return "APPROVED";
  return "REJECTED";
}
