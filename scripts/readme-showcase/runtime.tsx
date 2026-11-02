import { useState } from "react";
const noop = () => {
};
export const CHAT_ROUTE = "/tools/claude-chat";
export const isChatRoute = () => true;
export function useChatRuntime() {
  const [engine, setEngine] = useState("codex");
  const items = [
    { kind: "user", id: "initial-question", text: "我们正在整理演示商城的移动体验。先给一个可复核的小范围方案。" },
    { kind: "assistant", id: "initial-answer", text: "### 先把一个场景做完整\n\n选择订单筛选作为第一步：确认当前组件、保留交互上下文，再给出手机复核步骤。\n\n- 范围：订单列表与筛选面板。\n- 约束：复用已有组件，不改变订单状态规则。\n- 交付：改动说明、代码差异与适用验证记录。" },
    { kind: "user", id: "question", text: "请给演示商城补充手机端订单筛选，保留现有交互，并说明改动和验证方法。" },
    { kind: "assistant", id: "answer", text: "## 手机端订单筛选\n\n沿用当前筛选组件，保留列表位置。\n\n### 修改重点\n\n- 手机面板收起后，回到原列表。\n- 已选条件就地显示，可一键清除。\n- 确认后查询，减少输入时的刷新。\n\n### 复核建议\n\n在 390px 视口检查筛选、返回和空结果，再核对代码差异。" }
  ];
  if (window.innerWidth < 768) items.splice(0, 2);
  const running = new URLSearchParams(location.search).get("running") === "1";
  const chat = {
    sessionId: "showcase-orders",
    state: "ready",
    items,
    models: [{ value: "gpt-6.1-sol", displayName: "GPT-6.1-Sol" }, { value: "gpt-6-astra", displayName: "GPT-6-Astra" }],
    currentEngine: engine,
    currentProviderKind: "official",
    currentProviderBaseUrl: null,
    currentModel: "gpt-6.1-sol",
    mode: "default",
    codexReasoningEffort: "medium",
    codexSpeed: "default",
    running,
    pendingSessions: [],
    backgroundTasks: [],
    queued: running ? [{ id: "queued-demo", text: "接着补充无结果时的恢复提示，完成后给出截图。", displayText: "接着补充无结果时的恢复提示，完成后给出截图。", createdAt: 17936568e5, attachments: [] }] : [],
    slashCommands: [],
    historyLoading: false,
    historyExhausted: true,
    providerDiag: [],
    turnTokens: 0,
    skills: [],
    agents: [],
    mcpServers: [],
    plugins: [],
    capabilityErrors: [],
    skillDetails: [],
    voiceTransport: null,
    open: noop,
    send: noop,
    steer: noop,
    enqueue: noop,
    interrupt: noop,
    setModel: noop,
    setCodexOptions: noop,
    setMode: noop,
    loadHistory: noop,
    refreshModels: noop,
    refreshCapabilities: noop,
    removeQueued: noop,
    clearQueued: noop,
    sendQueuedNow: noop,
    switchEngine: (e) => setEngine(e),
    switchProvider: noop,
    switchTo: noop,
    resumeCurrent: noop,
    resumeHistory: noop,
    cleanRetry: noop,
    decide: noop,
    dismissFollowUpPrediction: noop,
    dismissSyncWarning: noop,
    dismissDuplication: noop
  };
  return { chat, setFloating: noop, setMinimized: noop, getReturnRoute: () => "/tools/claude-chat", gestureOn: false, toggleGesture: noop, gestureStatus: "idle", setGestureOn: noop };
}
export const ChatRuntimeProvider = ({ children }) => children;
