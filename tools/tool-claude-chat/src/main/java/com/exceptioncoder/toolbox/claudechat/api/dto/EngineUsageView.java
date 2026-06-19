package com.exceptioncoder.toolbox.claudechat.api.dto;

/**
 * 单引擎本地用量视图。available=false 表示该引擎本地日志缺失/不可用；
 * hasTokens=false（如 Gemini）表示本地无 token 记录，仅会话/轮次计数。
 */
public record EngineUsageView(
        String engine,
        boolean available,
        boolean hasTokens,
        String note,
        WindowStat today,
        WindowStat d7,
        WindowStat d30,
        QuotaView quota) {

    /** 一个时间窗口的聚合。 */
    public record WindowStat(
            long input,
            long output,
            long cacheRead,
            long cacheCreate,
            long total,
            int turns,
            int sessions,
            Double cacheHitRate) {
        public static WindowStat empty() {
            return new WindowStat(0, 0, 0, 0, 0, 0, 0, null);
        }
    }

    /** 官方额度快照（仅 Codex）。primary=短窗(5h)、secondary=长窗(周)。 */
    public record QuotaView(
            Double primaryUsedPercent,
            Integer primaryWindowMinutes,
            Long primaryResetsAt,
            Double secondaryUsedPercent,
            Integer secondaryWindowMinutes,
            Long secondaryResetsAt,
            String planType) {
    }
}
