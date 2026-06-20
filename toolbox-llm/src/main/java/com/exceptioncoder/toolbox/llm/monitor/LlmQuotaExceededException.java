package com.exceptioncoder.toolbox.llm.monitor;

/**
 * 配额硬上限拒绝：由 {@link QuotaGuardChatModel} 在进入路由前抛出。
 * 不进入路由、不触发故障转移，并落一条 {@code status=quota_blocked} 记录。
 */
public class LlmQuotaExceededException extends RuntimeException {

    public LlmQuotaExceededException(String message) {
        super(message);
    }
}
