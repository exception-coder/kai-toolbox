package com.exceptioncoder.toolbox.llm.observability;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter;
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporterBuilder;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import io.opentelemetry.sdk.trace.samplers.Sampler;
import io.opentelemetry.context.propagation.ContextPropagators;
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/** OpenTelemetry OTLP HTTP 装配；初始化失败时自动回退 No-op。 */
@Configuration
public class OtlpConfiguration {

    private static final Logger log = LoggerFactory.getLogger(OtlpConfiguration.class);

    @Bean(destroyMethod = "close")
    public AgentTelemetry agentTelemetry(AgentTelemetryProperties properties) {
        int maxLength = Math.max(64, properties.getMaxAttributeLength());
        String endpoint = resolveEndpoint(properties);
        if (!properties.isEnabled() || sdkDisabled() || blank(endpoint)) {
            log.info("[agent-telemetry] OpenTelemetry 已关闭");
            return AgentTelemetry.noop(maxLength);
        }
        try {
            OtlpHttpSpanExporterBuilder exporterBuilder = OtlpHttpSpanExporter.builder()
                    .setEndpoint(normalizeTraceEndpoint(endpoint))
                    .setTimeout(Duration.ofMillis(Math.max(100, properties.getExportTimeoutMs())));
            resolveHeaders(properties, endpoint).forEach(exporterBuilder::addHeader);

            BatchSpanProcessor processor = BatchSpanProcessor.builder(exporterBuilder.build())
                    .setExporterTimeout(Duration.ofMillis(Math.max(100, properties.getExportTimeoutMs())))
                    .build();
            Resource resource = Resource.getDefault().merge(Resource.create(Attributes.of(
                    AttributeKey.stringKey("service.name"), defaultIfBlank(properties.getServiceName(), "kai-toolbox"),
                    AttributeKey.stringKey("deployment.environment.name"),
                    defaultIfBlank(properties.getEnvironment(), "local"))));
            double ratio = Math.max(0.0, Math.min(1.0, properties.getSampleRatio()));
            Sampler rootSampler = ratio >= 1.0 ? Sampler.alwaysOn() : Sampler.traceIdRatioBased(ratio);
            SdkTracerProvider provider = SdkTracerProvider.builder()
                    .setResource(resource)
                    .setSampler(Sampler.parentBased(rootSampler))
                    .addSpanProcessor(processor)
                    .build();
            OpenTelemetry openTelemetry = OpenTelemetrySdk.builder()
                    .setTracerProvider(provider)
                    .setPropagators(ContextPropagators.create(W3CTraceContextPropagator.getInstance()))
                    .build();
            log.info("[agent-telemetry] OpenTelemetry OTLP HTTP 已启用 endpoint={}",
                    normalizeTraceEndpoint(endpoint));
            return new AgentTelemetry(openTelemetry, provider,
                    new SensitiveTelemetrySanitizer(maxLength), true);
        } catch (Exception e) {
            log.warn("[agent-telemetry] OpenTelemetry 初始化失败，已降级为 No-op: {}", e.getMessage());
            return AgentTelemetry.noop(maxLength);
        }
    }

    static String normalizeTraceEndpoint(String endpoint) {
        String normalized = endpoint == null ? "" : endpoint.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized.endsWith("/v1/traces") ? normalized : normalized + "/v1/traces";
    }

    static Map<String, String> parseHeaders(String raw) {
        if (blank(raw)) {
            return Map.of();
        }
        Map<String, String> headers = new LinkedHashMap<>();
        for (String item : raw.split(",")) {
            int separator = item.indexOf('=');
            if (separator <= 0) {
                continue;
            }
            String key = decode(item.substring(0, separator).trim());
            String value = decode(item.substring(separator + 1).trim());
            if (!key.isBlank() && !value.isBlank()) {
                headers.put(key, value);
            }
        }
        return Map.copyOf(headers);
    }

    static String resolveEndpoint(AgentTelemetryProperties properties) {
        if (!blank(properties.getEndpoint())) {
            return properties.getEndpoint().trim();
        }
        String baseUrl = properties.getLangfuse().getBaseUrl();
        if (blank(baseUrl)) {
            return null;
        }
        return baseUrl.trim().replaceAll("/+$", "") + "/api/public/otel";
    }

    static Map<String, String> resolveHeaders(AgentTelemetryProperties properties, String endpoint) {
        Map<String, String> headers = new LinkedHashMap<>(parseHeaders(properties.getHeaders()));
        if (endpoint != null && endpoint.contains("/api/public/otel")) {
            headers.putIfAbsent("x-langfuse-ingestion-version", "4");
            AgentTelemetryProperties.Langfuse langfuse = properties.getLangfuse();
            if (!containsHeader(headers, "Authorization")
                    && !blank(langfuse.getPublicKey()) && !blank(langfuse.getSecretKey())) {
                String credentials = langfuse.getPublicKey() + ":" + langfuse.getSecretKey();
                headers.put("Authorization", "Basic " + Base64.getEncoder()
                        .encodeToString(credentials.getBytes(StandardCharsets.UTF_8)));
            }
        }
        return Map.copyOf(headers);
    }

    private static boolean containsHeader(Map<String, String> headers, String name) {
        return headers.keySet().stream().anyMatch(key -> key.equalsIgnoreCase(name));
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static boolean sdkDisabled() {
        return "true".equalsIgnoreCase(System.getenv("OTEL_SDK_DISABLED"));
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String defaultIfBlank(String value, String fallback) {
        return blank(value) ? fallback : value.trim();
    }
}
