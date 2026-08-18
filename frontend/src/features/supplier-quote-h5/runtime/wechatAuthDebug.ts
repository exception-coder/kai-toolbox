const DEBUG_STORAGE_KEY = "supplier-quote.wechat-auth-debug";
const OAUTH_PENDING_KEY = "supplier-quote.wechat-oauth-pending";
export const WECHAT_AUTH_DEBUG_EVENT = "supplier-quote:wechat-auth-debug";

export type WechatAuthDebugLevel = "info" | "success" | "warning" | "error";

export interface WechatAuthDebugEntry {
  id: string;
  timestamp: string;
  level: WechatAuthDebugLevel;
  message: string;
  detail?: string;
}

export function recordWechatAuthDebug(
  level: WechatAuthDebugLevel,
  message: string,
  detail?: string,
) {
  const existingEntries = readWechatAuthDebugEntries();
  const latestEntry = existingEntries.at(-1);
  if (
    latestEntry?.message === message &&
    latestEntry.detail === detail &&
    Date.now() - new Date(latestEntry.timestamp).getTime() < 1_500
  ) {
    return;
  }
  const entry: WechatAuthDebugEntry = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    level,
    message,
    detail,
  };
  const entries = [...existingEntries, entry].slice(-20);
  writeSessionValue(DEBUG_STORAGE_KEY, JSON.stringify(entries));
  console.info("[supplier-quote][wechat-oauth]", entry);
  globalThis.dispatchEvent?.(
    new CustomEvent<WechatAuthDebugEntry>(WECHAT_AUTH_DEBUG_EVENT, {
      detail: entry,
    }),
  );
}

export function readWechatAuthDebugEntries(): WechatAuthDebugEntry[] {
  const stored = readSessionValue(DEBUG_STORAGE_KEY);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as WechatAuthDebugEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearWechatAuthDebugEntries() {
  removeSessionValue(DEBUG_STORAGE_KEY);
  globalThis.dispatchEvent?.(new CustomEvent(WECHAT_AUTH_DEBUG_EVENT));
}

export function markWechatOAuthRedirect() {
  writeSessionValue(OAUTH_PENDING_KEY, new Date().toISOString());
}

export function hasPendingWechatOAuthRedirect() {
  return Boolean(readSessionValue(OAUTH_PENDING_KEY));
}

export function completeWechatOAuthRedirect() {
  removeSessionValue(OAUTH_PENDING_KEY);
}

export function describeWechatEnvironment() {
  const inWechat = /MicroMessenger/i.test(globalThis.navigator?.userAgent ?? "");
  return `${globalThis.location?.hostname ?? "unknown"} · ${inWechat ? "微信内置浏览器" : "非微信浏览器"}`;
}

function readSessionValue(key: string) {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeSessionValue(key: string, value: string) {
  try {
    globalThis.sessionStorage?.setItem(key, value);
  } catch {
    // 调试日志不可阻断报价主流程。
  }
}

function removeSessionValue(key: string) {
  try {
    globalThis.sessionStorage?.removeItem(key);
  } catch {
    // 调试日志不可阻断报价主流程。
  }
}
