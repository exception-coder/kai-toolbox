package com.exceptioncoder.toolbox.system.update;

/** 自动更新当前状态；时间均为 epoch millis，便于脚本和前端直接消费。 */
public record AutoUpdateStatusView(
        boolean enabled,
        String mode,
        String source,
        long intervalSeconds,
        long stableSeconds,
        boolean requireIdle,
        String state,
        String message,
        Long lastCheck,
        Long nextCheck,
        Long lastSuccess,
        String localHead,
        String remoteHead,
        String candidateHead,
        String blockedReason,
        String lastError
) {
}
