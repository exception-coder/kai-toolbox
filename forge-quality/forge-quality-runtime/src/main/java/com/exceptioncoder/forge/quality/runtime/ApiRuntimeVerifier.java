package com.exceptioncoder.forge.quality.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Sends real HTTP requests and validates status and required JSON paths. */
public final class ApiRuntimeVerifier implements RuntimeVerifier {
    private static final String RULE_ID = "API-RUNTIME-001";
    private static final int DEFAULT_TIMEOUT_SECONDS = 15;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private final HttpClient client;

    /** Creates an API verifier with a redirect-safe JDK client. */
    public ApiRuntimeVerifier() {
        this(HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build());
    }

    ApiRuntimeVerifier(HttpClient client) {
        this.client = client;
    }

    @Override
    public String id() {
        return RULE_ID;
    }

    @Override
    public boolean supports(String scenarioType) {
        return "api".equalsIgnoreCase(scenarioType);
    }

    @Override
    public RuntimeVerificationResult verify(RuntimeScenario scenario) {
        Instant startedAt = Instant.now();
        ScenarioConfiguration configuration = new ScenarioConfiguration(scenario);
        int expectedStatus = configuration.optionalInteger("expectStatus", 200);
        try {
            HttpRequest request = createRequest(configuration);
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != expectedStatus) {
                return result(scenario, RuntimeStatus.FAILED, startedAt,
                        "HTTP status mismatch", "expected=" + expectedStatus + ", actual=" + response.statusCode());
            }
            List<Object> requiredPaths = configuration.optionalList("requiredJsonPaths");
            String missingPath = firstMissingPath(response.body(), requiredPaths);
            if (missingPath != null) {
                return result(scenario, RuntimeStatus.FAILED, startedAt,
                        "Required JSON path is missing", "path=" + missingPath);
            }
            return result(scenario, RuntimeStatus.PASSED, startedAt,
                    "HTTP request satisfied runtime expectations", "status=" + response.statusCode());
        } catch (IOException exception) {
            return result(scenario, RuntimeStatus.FAILED, startedAt,
                    "HTTP request failed: " + sanitized(exception.getMessage()), exception.getClass().getSimpleName());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return result(scenario, RuntimeStatus.FAILED, startedAt,
                    "HTTP request was interrupted", exception.getClass().getSimpleName());
        }
    }

    private static HttpRequest createRequest(ScenarioConfiguration configuration) throws IOException {
        String method = configuration.optionalText("method", "GET").toUpperCase(Locale.ROOT);
        String url = configuration.requiredText("url");
        int timeout = configuration.optionalInteger("timeoutSeconds", DEFAULT_TIMEOUT_SECONDS);
        Object body = configuration.value("body");
        String serializedBody = body == null ? "" : OBJECT_MAPPER.writeValueAsString(body);
        HttpRequest.BodyPublisher publisher = serializedBody.isEmpty()
                ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(serializedBody);
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(timeout)).method(method, publisher);
        if (!serializedBody.isEmpty()) {
            builder.header("Content-Type", "application/json");
        }
        applyHeaders(builder, configuration.optionalStringMap("headers"));
        return builder.build();
    }

    private static void applyHeaders(HttpRequest.Builder builder, Map<String, String> headers) {
        for (Map.Entry<String, String> header : headers.entrySet()) {
            String value = resolveHeaderValue(header.getKey(), header.getValue());
            builder.header(header.getKey(), value);
        }
    }

    private static String resolveHeaderValue(String name, String configuredValue) {
        boolean sensitive = name.equalsIgnoreCase("Authorization") || name.equalsIgnoreCase("Cookie")
                || name.toLowerCase(Locale.ROOT).contains("token");
        if (configuredValue.startsWith("${") && configuredValue.endsWith("}")) {
            String variable = configuredValue.substring(2, configuredValue.length() - 1);
            String value = System.getenv(variable);
            if (value == null) {
                throw new IllegalArgumentException("Environment variable is not set: " + variable);
            }
            return value;
        }
        if (sensitive) {
            throw new IllegalArgumentException("Sensitive HTTP header " + name + " must reference an environment variable");
        }
        return configuredValue;
    }

    private static String firstMissingPath(String body, List<Object> requiredPaths) throws IOException {
        if (requiredPaths.isEmpty()) {
            return null;
        }
        JsonNode root = OBJECT_MAPPER.readTree(body);
        for (Object configuredPath : requiredPaths) {
            String path = String.valueOf(configuredPath);
            JsonNode current = root;
            for (String segment : path.split("\\.")) {
                current = current.path(segment);
            }
            if (current.isMissingNode()) {
                return path;
            }
        }
        return null;
    }

    private static RuntimeVerificationResult result(RuntimeScenario scenario, RuntimeStatus status,
                                                    Instant startedAt, String message, String evidence) {
        long duration = Duration.between(startedAt, Instant.now()).toMillis();
        return new RuntimeVerificationResult(RULE_ID, scenario.id(), scenario.type(), status,
                duration, message, evidence);
    }

    private static String sanitized(String message) {
        if (message == null || message.isBlank()) {
            return "request could not be completed";
        }
        return message.length() <= 300 ? message : message.substring(0, 300);
    }
}
