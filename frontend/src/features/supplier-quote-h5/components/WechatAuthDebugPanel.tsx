import { useEffect, useState } from "react";
import { Activity, Check, ChevronDown, Trash2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clearWechatAuthDebugEntries,
  describeWechatEnvironment,
  hasPendingWechatOAuthRedirect,
  readWechatAuthDebugEntries,
  recordWechatAuthDebug,
  WECHAT_AUTH_DEBUG_EVENT,
  type WechatAuthDebugEntry,
} from "../runtime/wechatAuthDebug";

const levelStyles: Record<WechatAuthDebugEntry["level"], string> = {
  info: "bg-slate-400",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-rose-500",
};

export function WechatAuthDebugPanel() {
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState(readWechatAuthDebugEntries);

  useEffect(() => {
    const refresh = () => setEntries(readWechatAuthDebugEntries());
    globalThis.addEventListener(WECHAT_AUTH_DEBUG_EVENT, refresh);
    if (entries.length === 0) {
      recordWechatAuthDebug("info", "授权诊断已启动", describeWechatEnvironment());
    } else if (hasPendingWechatOAuthRedirect()) {
      recordWechatAuthDebug("info", "检测到微信授权跳转记录", "正在确认授权后的会话");
    }
    return () => globalThis.removeEventListener(WECHAT_AUTH_DEBUG_EVENT, refresh);
  }, []); // 仅在 H5 宿主首次挂载时登记环境。

  return (
    <aside className="fixed bottom-3 right-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col items-end text-xs">
      {expanded && (
        <section className="mb-2 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <header className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
            <div>
              <p className="font-semibold text-slate-900">微信授权诊断</p>
              <p className="mt-0.5 text-[10px] text-slate-500">仅保存在当前页面会话，不包含身份密钥</p>
            </div>
            <button
              type="button"
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="清空授权诊断日志"
              onClick={() => {
                clearWechatAuthDebugEntries();
                setEntries([]);
              }}
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
            </button>
          </header>
          <ol className="max-h-64 space-y-3 overflow-y-auto px-3 py-3">
            {entries.length === 0 ? (
              <li className="text-slate-500">暂无日志，刷新页面可重新记录授权链路。</li>
            ) : (
              [...entries].reverse().map((entry) => (
                <li key={entry.id} className="grid grid-cols-[0.5rem_1fr] gap-2">
                  <span
                    aria-hidden="true"
                    className={cn("mt-1.5 size-1.5 rounded-full", levelStyles[entry.level])}
                  />
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-800">{entry.message}</p>
                      <time className="shrink-0 text-[10px] tabular-nums text-slate-400">
                        {formatTime(entry.timestamp)}
                      </time>
                    </div>
                    {entry.detail && (
                      <p className="mt-0.5 break-all text-[10px] leading-4 text-slate-500">
                        {entry.detail}
                      </p>
                    )}
                  </div>
                </li>
              ))
            )}
          </ol>
        </section>
      )}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className="flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 font-medium text-slate-700 shadow-sm"
      >
        {latestStatusIcon(entries.at(-1))}
        授权诊断
        <ChevronDown
          aria-hidden="true"
          className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
        />
      </button>
    </aside>
  );
}

function latestStatusIcon(entry: WechatAuthDebugEntry | undefined) {
  if (entry?.level === "success") return <Check aria-hidden="true" className="size-3.5 text-emerald-600" />;
  if (entry?.level === "error") return <XCircle aria-hidden="true" className="size-3.5 text-rose-600" />;
  return <Activity aria-hidden="true" className="size-3.5 text-slate-500" />;
}

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}
