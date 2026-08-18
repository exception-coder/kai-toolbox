import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, LoaderCircle, RefreshCw, Send } from "lucide-react";
import { asGatewayError, type SubscriptionUserList, type SupplierQuoteGateway } from "../api/contract";

interface Props {
  gateway: SupplierQuoteGateway;
}

const EMPTY: SubscriptionUserList = { items: [], availableCount: 0, totalCount: 0 };

interface SendFeedback {
  tone: "success" | "error";
  message: string;
}

export function SubscriptionNotificationAdminPage({ gateway }: Props) {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [sendingKey, setSendingKey] = useState<number | null>(null);
  const [sendFeedback, setSendFeedback] = useState<SendFeedback | null>(null);
  const [error, setError] = useState("");
  const [content, setContent] = useState("您有新的市场报价任务，请点击进入报价。");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await gateway.getSubscriptionUsers());
    } catch (cause) {
      setError(asGatewayError(cause).message);
    } finally {
      setLoading(false);
    }
  }, [gateway]);

  useEffect(() => void load(), [load]);

  async function send(userKey: number) {
    setSendingKey(userKey);
    setSendFeedback(null);
    setError("");
    try {
      const result = await gateway.sendSubscriptionToUser(userKey, {
        title: "供应商报价通知",
        content,
      });
      await load();
      setSendFeedback(result.status === "SENT"
        ? { tone: "success", message: "通知发送成功，已消耗 1 次推送机会。" }
        : {
            tone: "error",
            message: `发送失败：${result.resultCode} · ${result.resultMessage}。本次机会仍可重试。`,
          });
    } catch (cause) {
      setSendFeedback({ tone: "error", message: `发送失败：${asGatewayError(cause).message}` });
    } finally {
      setSendingKey(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] text-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
        <header className="flex flex-col gap-6 border-b border-slate-200 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-500">供应商报价 · 微信触达</p>
            <h1 className="text-3xl font-semibold tracking-tight">订阅通知管理</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              用户每确认一次订阅，可发送一条报价通知。发送成功后该机会自动失效。
            </p>
          </div>
          <button onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 self-start border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />刷新
          </button>
        </header>

        <section className="grid gap-8 py-8 lg:grid-cols-[20rem_1fr]">
          <aside className="space-y-6">
            <div className="border-t-2 border-slate-950 pt-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">可推送机会</span>
                <BellRing size={18} />
              </div>
              <strong className="mt-3 block text-4xl font-semibold tabular-nums">
                {data.availableCount}<span className="text-xl font-normal text-slate-400"> / {data.totalCount}</span>
              </strong>
              <p className="mt-2 text-xs text-slate-500">剩余 / 历史订阅总数</p>
            </div>
            <label className="block text-sm font-medium">
              通知内容
              <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={4} maxLength={200} className="mt-2 w-full resize-none border border-slate-300 bg-white p-3 leading-6 outline-none focus:border-slate-950" />
            </label>
            <p className="text-xs leading-5 text-slate-500">目标地址由服务端生成并进入市场报价工作台，页面不会接触 AppSecret 或 OpenID。</p>
          </aside>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">订阅用户</h2>
              <span className="text-sm text-slate-500">共 {data.items.length} 人</span>
            </div>
            {error && <div className="mb-4 border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            {sendFeedback && (
              <div
                role={sendFeedback.tone === "success" ? "status" : "alert"}
                className={`mb-4 flex items-start gap-2 border-l-2 px-4 py-3 text-sm ${sendFeedback.tone === "success" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-red-500 bg-red-50 text-red-700"}`}
              >
                {sendFeedback.tone === "success" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
                <span>{sendFeedback.message}</span>
              </div>
            )}
            <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
              {!loading && data.items.length === 0 && <div className="px-5 py-14 text-center text-sm text-slate-500">暂无订阅记录。请先让用户在微信内确认一次订阅。</div>}
              {data.items.map((item) => (
                <article key={item.userKey} className="grid gap-4 px-5 py-5 md:grid-cols-[1fr_8rem_10rem_9rem] md:items-center">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm">{item.accountLabel}</strong>
                    <p className="mt-1 truncate text-sm text-slate-500">{item.supplierName ?? "尚未绑定公司业务账号"}</p>
                    {item.latestResultMessage && <p className="mt-2 text-xs text-slate-500">最近结果：{item.latestResultCode} · {item.latestResultMessage}</p>}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">可推送</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums">{item.availableCount}<span className="text-sm font-normal text-slate-400"> / {item.totalCount}</span></p>
                  </div>
                  <time className="text-sm tabular-nums text-slate-500">{new Date(item.latestCreatedAt).toLocaleString("zh-CN", { hour12: false })}</time>
                  <button disabled={!item.bound || item.availableCount === 0 || sendingKey !== null} onClick={() => send(item.userKey)} className="inline-flex h-10 items-center justify-center gap-2 bg-slate-950 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
                    {sendingKey === item.userKey ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
                    {sendingKey === item.userKey ? "发送中" : !item.bound ? "等待账号关联" : item.availableCount > 0 ? "一键推送" : "已用完"}
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
