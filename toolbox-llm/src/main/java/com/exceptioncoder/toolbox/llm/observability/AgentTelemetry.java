package com.exceptioncoder.toolbox.llm.observability;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.logs.LogRecordBuilder;
import io.opentelemetry.api.logs.Severity;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanBuilder;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.propagation.TextMapGetter;
import io.opentelemetry.context.propagation.TextMapSetter;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.logs.SdkLoggerProvider;

import java.util.LinkedHashMap;
import java.util.Map;

/** 标准 OpenTelemetry 的 Agent 入口，业务代码无需感知具体观测后端。 */
public final class AgentTelemetry implements AutoCloseable {

    private static final TextMapSetter<Map<String, String>> SETTER = Map::put;
    private static final TextMapGetter<Map<String, String>> GETTER = new TextMapGetter<>() {
        @Override
        public Iterable<String> keys(Map<String, String> carrier) {
            return carrier.keySet();
        }

        @Override
        public String get(Map<String, String> carrier, String key) {
            return carrier.get(key);
        }
    };

    private final OpenTelemetry openTelemetry;
    private final Tracer tracer;
    private final SdkTracerProvider tracerProvider;
    private final SdkLoggerProvider loggerProvider;
    private final io.opentelemetry.api.logs.Logger logger;
    private final SensitiveTelemetrySanitizer sanitizer;
    private final boolean enabled;

    AgentTelemetry(OpenTelemetry openTelemetry, SdkTracerProvider tracerProvider,
                   SdkLoggerProvider loggerProvider,
                   SensitiveTelemetrySanitizer sanitizer, boolean enabled) {
        this.openTelemetry = openTelemetry;
        this.tracer = openTelemetry.getTracer("com.exceptioncoder.toolbox.agent", "1.0.0");
        this.tracerProvider = tracerProvider;
        this.loggerProvider = loggerProvider;
        this.logger = openTelemetry.getLogsBridge().get("com.exceptioncoder.toolbox.agent");
        this.sanitizer = sanitizer;
        this.enabled = enabled;
    }

    public static AgentTelemetry noop(int maxAttributeLength) {
        return new AgentTelemetry(OpenTelemetry.noop(), null,
                null,
                new SensitiveTelemetrySanitizer(maxAttributeLength), false);
    }

    public boolean enabled() {
        return enabled;
    }

    public AgentSpan start(String spanName, AgentRunMetadata metadata) {
        return start(spanName, metadata, metadata == null ? null : metadata.parentTraceContext());
    }

    public AgentSpan start(String spanName, AgentRunMetadata metadata, TraceContext parent) {
        if (!enabled) {
            return AgentSpan.noop();
        }
        SpanBuilder builder = tracer.spanBuilder(spanName).setSpanKind(SpanKind.INTERNAL);
        if (parent != null && parent.valid()) {
            Map<String, String> carrier = new LinkedHashMap<>();
            carrier.put("traceparent", parent.traceparent());
            if (parent.tracestate() != null) {
                carrier.put("tracestate", parent.tracestate());
            }
            Context extracted = openTelemetry.getPropagators().getTextMapPropagator()
                    .extract(Context.root(), carrier, GETTER);
            builder.setParent(extracted);
        } else {
            builder.setParent(Context.current());
        }
        Span span = builder.startSpan();
        applyMetadata(span, metadata);
        Context context = Context.root().with(span);
        Map<String, String> carrier = new LinkedHashMap<>();
        openTelemetry.getPropagators().getTextMapPropagator().inject(context, carrier, SETTER);
        return new AgentSpan(span, context,
                new TraceContext(carrier.get("traceparent"), carrier.get("tracestate")));
    }

    public SensitiveTelemetrySanitizer sanitizer() {
        return sanitizer;
    }

    /** Emits a bounded structured record associated with the current Span. */
    public void info(String body, Map<String, ?> attributes) {
        if (!enabled) {
            return;
        }
        LogRecordBuilder builder = logger.logRecordBuilder()
                .setBody(sanitizer.sanitizeText(body))
                .setSeverity(Severity.INFO)
                .setSeverityText("INFO")
                .setContext(Context.current());
        sanitizer.sanitizeAttributes(attributes).forEach((key, value) -> {
            if (value instanceof Boolean bool) {
                builder.setAttribute(AttributeKey.booleanKey(key), bool);
            } else if (value instanceof Number number) {
                builder.setAttribute(AttributeKey.doubleKey(key), number.doubleValue());
            } else {
                builder.setAttribute(AttributeKey.stringKey(key), String.valueOf(value));
            }
        });
        builder.emit();
    }

    /** Captures the current W3C context so asynchronous work can keep the same trace. */
    public TraceContext currentTraceContext() {
        if (!enabled || !Span.current().getSpanContext().isValid()) {
            return TraceContext.empty();
        }
        Map<String, String> carrier = new LinkedHashMap<>();
        openTelemetry.getPropagators().getTextMapPropagator().inject(Context.current(), carrier, SETTER);
        return new TraceContext(carrier.get("traceparent"), carrier.get("tracestate"));
    }

    private void applyMetadata(Span span, AgentRunMetadata metadata) {
        if (metadata == null) {
            return;
        }
        setString(span, "agent.scope", metadata.scope());
        setString(span, "consult.session.id", metadata.correlationId());
        if (metadata.turnIndex() != null) {
            span.setAttribute("consult.turn.index", metadata.turnIndex().longValue());
        }
        setString(span, "agent.engine", metadata.engine());
        setString(span, "gen_ai.request.model", metadata.model());
        sanitizer.sanitizeAttributes(metadata.attributes()).forEach((key, value) -> {
            if (value instanceof Boolean bool) {
                span.setAttribute(AttributeKey.booleanKey(key), bool);
            } else if (value instanceof Number number) {
                span.setAttribute(AttributeKey.doubleKey(key), number.doubleValue());
            } else {
                setString(span, key, String.valueOf(value));
            }
        });
    }

    private void setString(Span span, String key, String value) {
        String safe = sanitizer.sanitizeText(value);
        if (safe != null && !safe.isBlank()) {
            span.setAttribute(AttributeKey.stringKey(key), safe);
        }
    }

    @Override
    public void close() {
        if (tracerProvider != null) {
            tracerProvider.close();
        }
        if (loggerProvider != null) {
            loggerProvider.close();
        }
    }
}
