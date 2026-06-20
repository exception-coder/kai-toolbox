package com.exceptioncoder.toolbox.llm.monitor;

import java.util.concurrent.Callable;

/**
 * 可选的调用归因上下文（ThreadLocal）。
 *
 * <p>网关层只能拿到 tier + 模型；工具/agent/阶段归因由调用方按需点亮：
 * AiServices 在同一线程同步调用模型，故 ThreadLocal 安全。务必用 {@link #run}/{@link #call}
 * 或 try/finally + {@link #clear()} 包裹，避免归因串线程泄漏。
 *
 * <p>不点亮也不影响网关计量——{@link MeteredChatModel} 读到 null 时归因字段留空。
 */
public final class LlmCallContext {

    /** 归因信息：三段可空。 */
    public record Attribution(String toolId, String agent, String stage) {}

    private static final ThreadLocal<Attribution> HOLDER = new ThreadLocal<>();

    private LlmCallContext() {
    }

    public static void set(String toolId, String agent, String stage) {
        HOLDER.set(new Attribution(toolId, agent, stage));
    }

    /** 当前归因，可能为 null。 */
    public static Attribution current() {
        return HOLDER.get();
    }

    public static void clear() {
        HOLDER.remove();
    }

    /** try/finally 包裹的执行助手，结束后自动清理。 */
    public static void run(String toolId, String agent, String stage, Runnable action) {
        set(toolId, agent, stage);
        try {
            action.run();
        } finally {
            clear();
        }
    }

    public static <T> T call(String toolId, String agent, String stage, Callable<T> action) throws Exception {
        set(toolId, agent, stage);
        try {
            return action.call();
        } finally {
            clear();
        }
    }
}
