package com.exceptioncoder.toolbox.llm.monitor;

/**
 * 单次顶层调用内的「第几次尝试」计数（ThreadLocal）。
 *
 * <p>{@link QuotaGuardChatModel} 作为每个 tier 的最外层装饰器，在进入路由前 {@link #reset()}；
 * {@link MeteredChatModel} 每次实际 chat() 调 {@link #next()}。这样故障转移链上每次尝试都拿到递增的 attempt，
 * 而 RoutingChatModel 本身保持纯路由、零改动。
 */
final class LlmCallAttempt {

    private static final ThreadLocal<int[]> HOLDER = ThreadLocal.withInitial(() -> new int[]{0});

    private LlmCallAttempt() {
    }

    static void reset() {
        HOLDER.get()[0] = 0;
    }

    static int next() {
        return ++HOLDER.get()[0];
    }
}
