package com.exceptioncoder.toolbox.claudechat.service.usage;

import java.util.List;

/**
 * 单引擎本地用量扫描器：只读扫本机会话日志，产出轮次记录（+ 可选官方额度快照）。
 * 目录不存在/解析失败应内部吞掉、返回空结果，由 UsageService 标记该引擎不可用。
 */
public interface EngineUsageScanner {

    /** 引擎标识：claude / codex / gemini。 */
    String engine();

    /** 扫描 mtime ≥ sinceMs 的本地日志。 */
    ScanResult scan(long sinceMs);

    /** 一次扫描结果：轮次记录 + 官方额度快照（仅 Codex 有，余者 null）。 */
    record ScanResult(List<TurnRecord> records, QuotaSnapshot quota) {
        public static ScanResult empty() {
            return new ScanResult(List.of(), null);
        }
    }

    /** 一轮（或一条 token 事件）的用量。hasTokens=false 时仅计会话/轮次（如 Gemini）。 */
    record TurnRecord(long ts, long input, long output, long cacheRead, long cacheCreate,
                      String sessionId, boolean hasTokens) {
    }

    /** 官方额度快照（Codex rollout 的 rate_limits）：primary=短窗(5h)，secondary=长窗(周)。 */
    record QuotaSnapshot(Double primaryUsedPercent, Integer primaryWindowMinutes, Long primaryResetsAt,
                         Double secondaryUsedPercent, Integer secondaryWindowMinutes, Long secondaryResetsAt,
                         String planType, long capturedAt) {
    }
}
