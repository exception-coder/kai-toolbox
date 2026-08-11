package com.exceptioncoder.toolbox.eval.service;

import com.exceptioncoder.toolbox.eval.domain.EvalResult;
import com.exceptioncoder.toolbox.eval.repository.EvalResultRepository;
import com.exceptioncoder.toolbox.llm.observability.AgentTelemetry;
import com.exceptioncoder.toolbox.llm.observability.AgentTelemetryProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 将本地确定性评测结论异步投影为 Langfuse Score。 */
@Slf4j
@Service
public class LangfuseScoreExportService {

    public static final String SKIPPED = "SKIPPED";
    public static final String PENDING = "PENDING";
    public static final String SUCCESS = "SUCCESS";
    public static final String FAILED = "FAILED";

    private final EvalResultRepository resultRepository;
    private final AgentTelemetryProperties properties;
    private final AgentTelemetry telemetry;
    private final ObjectMapper mapper;
    private final HttpClient httpClient;

    public LangfuseScoreExportService(EvalResultRepository resultRepository,
                                      AgentTelemetryProperties properties,
                                      AgentTelemetry telemetry,
                                      ObjectMapper mapper) {
        this.resultRepository = resultRepository;
        this.properties = properties;
        this.telemetry = telemetry;
        this.mapper = mapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(timeoutMs()))
                .build();
    }

    public String initialStatus(String traceId) {
        return available() && traceId != null && !traceId.isBlank() ? PENDING : SKIPPED;
    }

    public void schedule(EvalResult result) {
        if (result == null || !PENDING.equals(result.getScoreExportStatus())) {
            return;
        }
        Thread.ofVirtual().name("langfuse-score-" + result.getId()).start(() -> export(result));
    }

    public int retryFailedByRun(String runId) {
        if (!available()) {
            return 0;
        }
        List<EvalResult> failed = resultRepository.findFailedScoreExportsByRun(runId);
        failed.forEach(result -> {
            result.setScoreExportStatus(PENDING);
            result.setScoreExportError(null);
            resultRepository.updateScoreExport(result.getId(), PENDING, null, null);
            schedule(result);
        });
        return failed.size();
    }

    private void export(EvalResult result) {
        try {
            postScore(result, "business_assertion_pass", "BOOLEAN",
                    "PASS".equals(result.getVerdict()) ? 1 : 0,
                    "Deterministic local assertion verdict");
            postScore(result, "answer_correctness", "NUMERIC", result.getScore(),
                    "Deterministic local evaluation score");
            long now = System.currentTimeMillis();
            resultRepository.updateScoreExport(result.getId(), SUCCESS, null, now);
        } catch (Exception e) {
            String error = telemetry.sanitizer().sanitizeText(e.getClass().getSimpleName() + ": " + e.getMessage());
            resultRepository.updateScoreExport(result.getId(), FAILED, error, null);
            log.warn("[eval-score] Langfuse Score 导出失败 resultId={}: {}", result.getId(), error);
        }
    }

    private void postScore(EvalResult result, String name, String dataType,
                           Number value, String comment) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", result.getId() + "-" + name.replace('_', '-'));
        body.put("traceId", result.getTraceId());
        body.put("name", name);
        body.put("value", value);
        body.put("dataType", dataType);
        body.put("comment", comment);

        HttpRequest request = HttpRequest.newBuilder(scoreUri())
                .timeout(Duration.ofMillis(timeoutMs()))
                .header("Authorization", authorization())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("HTTP " + response.statusCode() + " "
                    + telemetry.sanitizer().sanitizeText(response.body()));
        }
    }

    private boolean available() {
        AgentTelemetryProperties.Langfuse langfuse = properties.getLangfuse();
        return properties.isEnabled()
                && notBlank(langfuse.getBaseUrl())
                && notBlank(langfuse.getPublicKey())
                && notBlank(langfuse.getSecretKey());
    }

    private URI scoreUri() {
        String base = properties.getLangfuse().getBaseUrl().trim().replaceAll("/+$", "");
        return URI.create(base.endsWith("/api/public/scores") ? base : base + "/api/public/scores");
    }

    private String authorization() {
        String credentials = properties.getLangfuse().getPublicKey() + ":"
                + properties.getLangfuse().getSecretKey();
        return "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
    }

    private long timeoutMs() {
        return Math.max(100, properties.getExportTimeoutMs());
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}
