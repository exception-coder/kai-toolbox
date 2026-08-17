package com.regentech_fashion.wyoooni.enterprise.infrastructure.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.regentech_fashion.wyoooni.enterprise.application.gateway.EnterpriseGateway;
import com.regentech_fashion.wyoooni.enterprise.application.gateway.EnterpriseGatewayException;
import com.regentech_fashion.wyoooni.enterprise.application.gateway.EnterpriseRequestContext;
import com.regentech_fashion.wyoooni.enterprise.config.WyoooniEnterpriseProperties;
import com.regentech_fashion.wyoooni.enterprise.domain.identity.EnterpriseAccount;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;

/** 调用公司统一业务网关的通用 HTTP 客户端。 */
public class WyoooniEnterpriseGatewayClient implements EnterpriseGateway {
    private static final int BAD_GATEWAY = 502;
    private static final int SERVICE_UNAVAILABLE = 503;
    private final WyoooniEnterpriseProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public WyoooniEnterpriseGatewayClient(WyoooniEnterpriseProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(properties.getConnectTimeoutMillis()))
                .build();
    }

    /** 校验任意来源系统的公司业务账号。 */
    @Override
    public Optional<EnterpriseAccount> verifyAccount(String username, String password) {
        HttpResponse<String> response = send("POST", properties.getAccountVerificationPath(),
                Map.of("username", username, "password", password), null, null);
        if (response.statusCode() == 401 || response.statusCode() == 403) {
            return Optional.empty();
        }
        requireSuccess(response, "ACCOUNT_VERIFY_UNAVAILABLE", "业务账号服务暂时不可用");
        return parseAccount(response.body(), username);
    }

    /** 调用带公司业务主体上下文的网关接口。 */
    @Override
    public <T> T exchange(String method, String path, Object body, EnterpriseRequestContext context,
                          String idempotencyKey, Class<T> responseType) {
        HttpResponse<String> response = send(method, path, body, context, idempotencyKey);
        requireSuccess(response, "WYOOONI_GATEWAY_UNAVAILABLE", "公司业务网关暂时不可用");
        try {
            return objectMapper.readValue(response.body(), responseType);
        } catch (Exception exception) {
            throw invalidResponse("公司业务网关响应格式不正确");
        }
    }

    private Optional<EnterpriseAccount> parseAccount(String responseBody, String fallbackUsername) {
        try {
            JsonNode json = objectMapper.readTree(responseBody);
            if (!json.path("authenticated").asBoolean(false)) {
                return Optional.empty();
            }
            return Optional.of(new EnterpriseAccount(required(json, "accountId"),
                    json.path("username").asText(fallbackUsername), required(json, "displayName"),
                    required(json, "businessPartyId"), required(json, "businessPartyName"),
                    required(json, "sourceSystem")));
        } catch (EnterpriseGatewayException exception) {
            throw exception;
        } catch (Exception exception) {
            throw invalidResponse("业务账号服务响应格式不正确");
        }
    }

    private HttpResponse<String> send(String method, String path, Object body, EnterpriseRequestContext context,
                                      String idempotencyKey) {
        validateConfiguration();
        try {
            HttpRequest.Builder builder = baseRequest(path);
            addContextHeaders(builder, context, idempotencyKey);
            addBody(builder, method, body);
            return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (EnterpriseGatewayException exception) {
            throw exception;
        } catch (Exception exception) {
            throw unavailable();
        }
    }

    private HttpRequest.Builder baseRequest(String path) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(endpoint(path))
                .timeout(Duration.ofMillis(properties.getRequestTimeoutMillis()))
                .header("Accept", "application/json");
        if (!properties.getServiceToken().isBlank()) {
            builder.header("Authorization", "Bearer " + properties.getServiceToken());
        }
        return builder;
    }

    private void addContextHeaders(HttpRequest.Builder builder, EnterpriseRequestContext context,
                                   String idempotencyKey) {
        if (context != null) {
            builder.header("X-Business-Account-Id", context.accountId())
                    .header("X-Source-System", context.sourceSystem())
                    .header("X-Business-Party-Id", context.businessPartyId());
        }
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            builder.header("Idempotency-Key", idempotencyKey);
        }
    }

    private void addBody(HttpRequest.Builder builder, String method, Object body) throws Exception {
        if (body == null) {
            builder.method(method, HttpRequest.BodyPublishers.noBody());
            return;
        }
        builder.header("Content-Type", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
    }

    private void requireSuccess(HttpResponse<String> response, String fallbackCode, String fallbackMessage) {
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            return;
        }
        try {
            JsonNode json = objectMapper.readTree(response.body());
            throw new EnterpriseGatewayException(response.statusCode(),
                    json.path("errorCode").asText(fallbackCode), json.path("message").asText(fallbackMessage));
        } catch (EnterpriseGatewayException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new EnterpriseGatewayException(response.statusCode(), fallbackCode, fallbackMessage);
        }
    }

    private URI endpoint(String path) {
        String baseUrl = properties.getBaseUrl().replaceAll("/+$", "");
        String normalizedPath = path.startsWith("/") ? path : "/" + path;
        return URI.create(baseUrl + normalizedPath);
    }

    private void validateConfiguration() {
        if (properties.getBaseUrl() == null || properties.getBaseUrl().isBlank()) {
            throw new EnterpriseGatewayException(SERVICE_UNAVAILABLE, "WYOOONI_GATEWAY_NOT_CONFIGURED",
                    "公司业务网关地址尚未配置");
        }
    }

    private static String required(JsonNode json, String field) {
        String value = json.path(field).asText("");
        if (value.isBlank()) {
            throw invalidResponse("公司业务网关响应缺少 " + field);
        }
        return value;
    }

    private static EnterpriseGatewayException invalidResponse(String message) {
        return new EnterpriseGatewayException(BAD_GATEWAY, "WYOOONI_GATEWAY_RESPONSE_INVALID", message);
    }

    private static EnterpriseGatewayException unavailable() {
        return new EnterpriseGatewayException(BAD_GATEWAY, "WYOOONI_GATEWAY_UNAVAILABLE",
                "公司业务网关暂时不可用");
    }
}
