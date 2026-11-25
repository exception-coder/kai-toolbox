package com.exceptioncoder.toolbox.foreconsult.backend;

import com.exceptioncoder.toolbox.llm.observability.AgentRunMetadata;
import com.exceptioncoder.toolbox.llm.observability.AgentSpan;
import com.exceptioncoder.toolbox.llm.observability.AgentTelemetry;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.opentelemetry.context.Scope;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Component;

/** Low-content execution diagnostics remain available when OTLP export is disabled. */
@Component
public class ConsultAnalysisTelemetry {
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(ConsultAnalysisTelemetry.class);
    private static final String IMPLEMENTATION = implementationDigest();
    private final AgentTelemetry telemetry;
    private final ObjectMapper mapper;
    private final Map<String, Execution> active = new ConcurrentHashMap<>();

    public ConsultAnalysisTelemetry(AgentTelemetry telemetry) {
        this(telemetry, new ObjectMapper());
    }

    @org.springframework.beans.factory.annotation.Autowired
    public ConsultAnalysisTelemetry(AgentTelemetry telemetry, ObjectMapper mapper) {
        this.telemetry = telemetry;
        this.mapper = mapper;
    }

    public Execution start(String clientId, String id, ConsultAnalysisInput input, long queueMillis) {
        var attributes = new LinkedHashMap<String, Object>();
        attributes.put("consult.client.id", clientId);
        attributes.put("consult.request.id", input.requestId());
        attributes.put("consult.task.id", id);
        attributes.put("consult.implementation.sha256", IMPLEMENTATION);
        attributes.put("consult.queue.ms", Math.max(0, queueMillis));
        attributes.put("consult.rules.sha256", ConsultBackendAuth.hash(input.businessInstructions() == null ? "" : input.businessInstructions()));
        var span = telemetry.start("consult.backend.execution",
                new AgentRunMetadata("consult-backend", id, null, "codex", null, attributes));
        var execution = new Execution(id, span, attributes);
        active.put(id, execution);
        execution.attribute("consult.active.count", active.size());
        LOG.info("Consult backend started {}", json(attributes));
        return execution;
    }

    public void cancellationRequested(String id) {
        var execution = active.get(id);
        if (execution != null && execution.cancellationAt.compareAndSet(0, System.nanoTime())) {
            LOG.info("Consult backend cancellation requested task={}", id);
        }
    }

    public final class Execution implements AutoCloseable {
        private final String id;
        private final AgentSpan span;
        private final Map<String, Object> attributes;
        private final long started = System.nanoTime();
        private final AtomicLong cancellationAt = new AtomicLong();
        private String outcome = "FAILED";
        private String errorCode = "EXECUTION_FAILED";

        private Execution(String id, AgentSpan span, Map<String, Object> attributes) {
            this.id = id;
            this.span = span;
            this.attributes = attributes;
        }

        public Stage stage(String name) {
            return new Stage(name, this);
        }

        public void attribute(String key, String value) {
            String safe = telemetry.sanitizer().sanitizeText(value);
            if (safe != null) {
                attributes.put(key, safe);
                span.attribute(key, safe);
            }
        }

        public void attribute(String key, long value) {
            attributes.put(key, value);
            span.attribute(key, value);
        }

        public void complete(String status, String code) {
            outcome = status;
            errorCode = code;
        }

        @Override
        public void close() {
            active.remove(id, this);
            attribute("consult.total.ms", elapsed(started));
            long cancelled = cancellationAt.get();
            if (cancelled != 0) {
                attribute("consult.cancel.wait.ms", elapsed(cancelled));
            }
            attribute("consult.outcome", outcome);
            if (errorCode == null) {
                span.success(outcome);
            } else {
                attribute("consult.error.code", errorCode);
                span.fail(errorCode, null);
            }
            LOG.info("Consult backend execution {}", json(attributes));
        }
    }

    public final class Stage implements AutoCloseable {
        private final String name;
        private final Execution execution;
        private final AgentSpan span;
        private final Scope scope;
        private final long started = System.nanoTime();
        private boolean succeeded;

        private Stage(String name, Execution execution) {
            this.name = name;
            this.execution = execution;
            span = telemetry.start("consult.backend." + name,
                    AgentRunMetadata.generic("consult-backend", execution.id, "codex", null), execution.span.traceContext());
            scope = span.makeCurrent();
        }

        public void success() {
            succeeded = true;
        }

        @Override
        public void close() {
            scope.close();
            execution.attribute("consult." + name + ".ms", elapsed(started));
            execution.attribute("consult." + name + ".status", succeeded ? "SUCCEEDED" : "FAILED");
            if (succeeded) {
                span.success("completed");
            } else {
                span.fail("stage_failed", null);
            }
        }
    }

    private static long elapsed(long start) {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
    }

    private String json(Map<String, Object> attributes) {
        try {
            return mapper.writer().without(com.fasterxml.jackson.databind.SerializationFeature.INDENT_OUTPUT).writeValueAsString(attributes);
        } catch (JsonProcessingException error) {
            return "{\"diagnosticError\":\"SERIALIZATION_FAILED\"}";
        }
    }

    private static String implementationDigest() {
        var bytes = new java.io.ByteArrayOutputStream();
        for (var type : java.util.List.of(ConsultAnalysisTelemetry.class, Execution.class, Stage.class,
                ConsultAnalysisService.class, ConsultAnalysisModel.class, ConsultAnalysisInput.class, ConsultAnalysisEvidence.class)) {
            String resource = type.getName().substring(type.getPackageName().length() + 1) + ".class";
            try (var stream = type.getResourceAsStream(resource)) {
                if (stream == null) {
                    return "UNAVAILABLE";
                }
                stream.transferTo(bytes);
            } catch (IOException error) {
                return "UNAVAILABLE";
            }
        }
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray()));
        } catch (java.security.NoSuchAlgorithmException error) {
            return "UNAVAILABLE";
        }
    }
}
