package com.exceptioncoder.toolbox.llm.monitor;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * 将 Java 侧 {@link LlmCallEvent} 镜像为 OTLP HTTP/JSON span 推送到 AgentScope Studio。
 *
 * <p><b>定位</b>：这是一个可选的「双写旁路」——主监控是 toolbox 内置的 llm-monitor 仪表盘
 * （SQLite 持久化，开箱即用）。当你同时运行了 Python sidecar 并想在 Studio 统一看两侧 trace 时，
 * 配置 {@code toolbox.llm.monitor.agent-scope-studio-url} 即可启用；不配则完全不推送。
 *
 * <p>零新 Maven 依赖：Java 内置 {@link HttpClient} + 手拼 OTLP JSON（符合 OTel Protobuf-JSON
 * 映射规范）。推送完全异步，超时 / 网络异常全部吞掉，Studio 不可用绝不影响业务与本地落库。
 *
 * <p>AgentScope Studio LLM 专属面板依赖三个 {@code agentscope.*} 属性：
 * <ul>
 *   <li>{@code agentscope.function.input}  — 请求概要（tier / model / chars）</li>
 *   <li>{@code agentscope.function.output} — 响应概要（token / cost / finish_reason）</li>
 *   <li>{@code agentscope.format.count}    — total token 数（整数）</li>
 * </ul>
 */
public class AgentScopeStudioExporter {

    private static final Logger log = LoggerFactory.getLogger(AgentScopeStudioExporter.class);

    private final URI endpoint;
    private final HttpClient http;

    public AgentScopeStudioExporter(String studioUrl, int timeoutMs) {
        this.endpoint = URI.create(studioUrl.replaceAll("/+$", "") + "/v1/traces");
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(timeoutMs))
                .build();
    }

    /**
     * 将一批 LlmCallEvent 打包为单个 OTLP JSON resourceSpans 请求推送。
     * 调用方保证在虚拟线程中调用，本方法可阻塞等待响应。
     */
    public void export(List<LlmCallEvent> events) {
        if (events == null || events.isEmpty()) {
            return;
        }
        try {
            String body = buildOtlpJson(events);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(endpoint)
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<Void> resp = http.send(req, HttpResponse.BodyHandlers.discarding());
            if (resp.statusCode() >= 400) {
                log.warn("[toolbox-llm] AgentScope Studio 返回 HTTP {}，span 未收录", resp.statusCode());
            }
        } catch (Exception ex) {
            log.debug("[toolbox-llm] 推送 AgentScope Studio 失败（不影响业务）: {}", ex.toString());
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // OTLP JSON 构造（符合 OTel Protobuf-JSON Mapping spec）
    // ────────────────────────────────────────────────────────────────────────

    private static String buildOtlpJson(List<LlmCallEvent> events) {
        StringBuilder spans = new StringBuilder();
        for (LlmCallEvent e : events) {
            if (spans.length() > 0) spans.append(',');
            spans.append(spanJson(e));
        }
        return """
                {"resourceSpans":[{"resource":{"attributes":[
                  {"key":"service.name","value":{"stringValue":"kai-toolbox"}},
                  {"key":"service.namespace","value":{"stringValue":"toolbox-llm"}}
                ]},"scopeSpans":[{"scope":{"name":"com.exceptioncoder.toolbox.llm","version":"1.0"},
                "spans":[%s]}]}]}""".formatted(spans);
    }

    private static String spanJson(LlmCallEvent e) {
        long startNs = e.epochMs() * 1_000_000L;
        long endNs   = startNs + e.latencyMs() * 1_000_000L;
        int  statusCode = LlmCallEvent.STATUS_ERROR.equals(e.status()) ? 2 : 1;  // 1=OK 2=ERROR
        String traceId = randomHex(32);
        String spanId  = randomHex(16);

        // agentscope.function.input — 请求概要（避免泄露 prompt 原文）
        String inputSummary = jsonStr("tier=" + e.tier()
                + " model=" + nvl(e.modelId())
                + " tool=" + nvl(e.toolId())
                + " agent=" + nvl(e.agent())
                + " chars=" + e.requestChars());

        // agentscope.function.output — 响应概要
        String outputSummary = jsonStr("status=" + e.status()
                + " tokens=" + nvl(e.totalTokens())
                + " cost=" + String.format("%.4f", e.cost()) + "CNY"
                + " finish=" + nvl(e.finishReason())
                + " estimated=" + e.tokensEstimated()
                + " chars=" + e.responseChars());

        // agentscope.format.count — total token（整数，供 Studio token 面板）
        int tokenCount = e.totalTokens() != null ? e.totalTokens() : 0;

        return """
                {"traceId":"%s","spanId":"%s","name":"llm.call",
                 "kind":3,
                 "startTimeUnixNano":"%d","endTimeUnixNano":"%d",
                 "attributes":[
                   {"key":"agentscope.function.input","value":{"stringValue":%s}},
                   {"key":"agentscope.function.output","value":{"stringValue":%s}},
                   {"key":"agentscope.format.count","value":{"intValue":"%d"}},
                   {"key":"llm.tier","value":{"stringValue":"%s"}},
                   {"key":"llm.model_id","value":{"stringValue":"%s"}},
                   {"key":"llm.model_name","value":{"stringValue":"%s"}},
                   {"key":"llm.status","value":{"stringValue":"%s"}},
                   {"key":"llm.latency_ms","value":{"intValue":"%d"}},
                   {"key":"llm.attempt","value":{"intValue":"%d"}},
                   {"key":"llm.input_tokens","value":{"intValue":"%d"}},
                   {"key":"llm.output_tokens","value":{"intValue":"%d"}},
                   {"key":"llm.cost_cny","value":{"doubleValue":%s}},
                   {"key":"llm.tool_id","value":{"stringValue":"%s"}},
                   {"key":"llm.agent","value":{"stringValue":"%s"}}
                 ],
                 "status":{"code":%d}}"""
                .formatted(
                        traceId, spanId,
                        startNs, endNs,
                        inputSummary, outputSummary, tokenCount,
                        e.tier(),
                        nvl(e.modelId()),
                        nvl(e.modelName()),
                        e.status(),
                        e.latencyMs(),
                        e.attempt(),
                        e.inputTokens() != null ? e.inputTokens() : 0,
                        e.outputTokens() != null ? e.outputTokens() : 0,
                        String.format("%.6f", e.cost()),
                        nvl(e.toolId()),
                        nvl(e.agent()),
                        statusCode);
    }

    /** JSON 转义字符串并用双引号包裹。 */
    private static String jsonStr(String s) {
        if (s == null) s = "";
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static String nvl(Object v) {
        return v == null ? "" : String.valueOf(v);
    }

    private static String randomHex(int len) {
        byte[] bytes = new byte[len / 2];
        for (int i = 0; i < bytes.length; i++) {
            bytes[i] = (byte) (Math.random() * 256);
        }
        return HexFormat.of().formatHex(bytes);
    }
}
