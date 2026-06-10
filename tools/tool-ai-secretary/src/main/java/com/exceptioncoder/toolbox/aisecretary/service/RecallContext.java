package com.exceptioncoder.toolbox.aisecretary.service;

import java.util.function.Consumer;

/**
 * 把"当前请求该把 step 推到哪个 SSE"通过 ThreadLocal 传给工具方法。
 *
 * <p>AiServices 的 tool-loop 是同步执行的——工具方法和 {@code ask()} 跑在同一线程上,
 * 故在该线程入口 {@link #set} 一个 sink、工具里 {@link #emit},即可把每步推到对应连接,
 * 无需把 SseEmitter 透传进每个工具签名。
 */
public final class RecallContext {

    private RecallContext() {
    }

    private static final ThreadLocal<Consumer<RecallStep>> SINK = new ThreadLocal<>();

    public static void set(Consumer<RecallStep> sink) {
        SINK.set(sink);
    }

    public static void clear() {
        SINK.remove();
    }

    public static void emit(RecallStep step) {
        Consumer<RecallStep> sink = SINK.get();
        if (sink != null) {
            try {
                sink.accept(step);
            } catch (Exception ignored) {
                // 推送失败（连接已断）不应影响主流程
            }
        }
    }
}
