package com.regentech_fashion.supplierquote.infrastructure;

import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.supplierquote.config.SupplierQuoteProperties;
import com.regentech_fashion.supplierquote.domain.ScmCredentialVerifier;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.Optional;

public class ConfiguredScmCredentialVerifier implements ScmCredentialVerifier {
    private final SupplierQuoteProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newHttpClient();

    public ConfiguredScmCredentialVerifier(SupplierQuoteProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    @Override
    public Optional<VerifiedScmAccount> verify(String username, String password) {
        if ("mock".equalsIgnoreCase(properties.getScm().getMode())) {
            return "supplier-demo".equals(username) && "123456".equals(password)
                    ? Optional.of(new VerifiedScmAccount("scm-demo-001", username, "王经理",
                    "supplier-demo-001", "广州睿程服饰有限公司"))
                    : Optional.empty();
        }
        String verifyUrl = properties.getScm().getVerifyUrl();
        if (verifyUrl == null || verifyUrl.isBlank()) {
            throw new SupplierQuoteApiException(HttpStatus.SERVICE_UNAVAILABLE, "SCM_NOT_CONFIGURED",
                    "SCM 登录校验地址尚未配置");
        }
        try {
            String body = objectMapper.writeValueAsString(Map.of("username", username, "password", password));
            HttpRequest request = HttpRequest.newBuilder(URI.create(verifyUrl))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 401 || response.statusCode() == 403) return Optional.empty();
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new SupplierQuoteApiException(HttpStatus.BAD_GATEWAY, "SCM_VERIFY_UNAVAILABLE",
                        "SCM 登录服务暂时不可用");
            }
            JsonNode json = objectMapper.readTree(response.body());
            if (!json.path("authenticated").asBoolean(false)) return Optional.empty();
            return Optional.of(new VerifiedScmAccount(
                    required(json, "userId"), username, required(json, "displayName"),
                    required(json, "supplierId"), required(json, "supplierName")));
        } catch (SupplierQuoteApiException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (Exception exception) {
            throw unavailable();
        }
    }

    private static String required(JsonNode node, String field) {
        String value = node.path(field).asText("");
        if (value.isBlank()) throw new SupplierQuoteApiException(HttpStatus.BAD_GATEWAY,
                "SCM_VERIFY_RESPONSE_INVALID", "SCM 登录服务响应缺少 " + field);
        return value;
    }

    private static SupplierQuoteApiException unavailable() {
        return new SupplierQuoteApiException(HttpStatus.BAD_GATEWAY, "SCM_VERIFY_UNAVAILABLE",
                "SCM 登录服务暂时不可用");
    }
}
