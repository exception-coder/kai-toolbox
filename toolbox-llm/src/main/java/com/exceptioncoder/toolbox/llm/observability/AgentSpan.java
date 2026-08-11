package com.exceptioncoder.toolbox.llm.observability;

import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;

import java.util.concurrent.atomic.AtomicBoolean;

/** Agent Span 的窄封装，统一保证幂等结束。 */
public final class AgentSpan implements AutoCloseable {

    private final Span span;
    private final Context context;
    private final TraceContext traceContext;
    private final AtomicBoolean ended = new AtomicBoolean();

    AgentSpan(Span span, Context context, TraceContext traceContext) {
        this.span = span;
        this.context = context;
        this.traceContext = traceContext;
    }

    static AgentSpan noop() {
        return new AgentSpan(Span.getInvalid(), Context.root(), TraceContext.empty());
    }

    public Scope makeCurrent() {
        return context.makeCurrent();
    }

    public TraceContext traceContext() {
        return traceContext;
    }

    public String traceId() {
        String traceId = span.getSpanContext().getTraceId();
        return span.getSpanContext().isValid() ? traceId : null;
    }

    public boolean recording() {
        return span.isRecording();
    }

    public void success(String stopReason) {
        if (stopReason != null && !stopReason.isBlank()) {
            span.setAttribute("agent.stop_reason", stopReason);
        }
        finish(StatusCode.OK, null, null);
    }

    public void fail(String message, Throwable error) {
        finish(StatusCode.ERROR, message, error);
    }

    public void event(String name) {
        if (span.isRecording() && name != null && !name.isBlank()) {
            span.addEvent(name);
        }
    }

    public void attribute(String key, long value) {
        if (span.isRecording() && key != null && !key.isBlank()) {
            span.setAttribute(AttributeKey.longKey(key), value);
        }
    }

    private void finish(StatusCode status, String message, Throwable error) {
        if (!ended.compareAndSet(false, true)) {
            return;
        }
        if (error != null) {
            span.recordException(error);
        }
        span.setStatus(status, message == null ? "" : message);
        span.end();
    }

    @Override
    public void close() {
        success(null);
    }
}
