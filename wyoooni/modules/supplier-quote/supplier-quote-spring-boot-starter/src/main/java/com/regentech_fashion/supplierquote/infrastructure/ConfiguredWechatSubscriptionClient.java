package com.regentech_fashion.supplierquote.infrastructure;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.supplierquote.config.SupplierQuoteProperties;
import com.regentech_fashion.supplierquote.domain.WechatSubscriptionClient;
import org.springframework.http.HttpStatus;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/** 微信一次性订阅消息的官方 HTTP 接口实现。 */
public class ConfiguredWechatSubscriptionClient implements WechatSubscriptionClient {
    private static final Duration TOKEN_SAFETY_WINDOW = Duration.ofMinutes(5);

    private final SupplierQuoteProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private volatile AccessToken cachedToken;

    public ConfiguredWechatSubscriptionClient(SupplierQuoteProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    @Override
    public String authorizationUrl(String reservedState) {
        var wechat = properties.getWechat();
        requireSubscriptionConfiguration();
        return "https://mp.weixin.qq.com/mp/subscribemsg?action=get_confirm"
                + "&appid=" + encode(wechat.getAppId())
                + "&scene=" + wechat.getSubscriptionScene()
                + "&template_id=" + encode(wechat.getSubscriptionTemplateId())
                + "&redirect_url=" + encode(wechat.getSubscriptionCallbackUrl())
                + "&reserved=" + encode(reservedState)
                + "#wechat_redirect";
    }

    @Override
    public SendResult send(String openid, String templateId, int scene, String title,
                           String content, String targetUrl) {
        String accessToken = accessToken();
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("touser", openid);
        payload.put("template_id", templateId);
        payload.put("url", targetUrl);
        payload.put("scene", scene);
        payload.put("title", title);
        payload.putObject("data").putObject("content").put("value", content).put("color", "#111827");
        JsonNode response = postJson("https://api.weixin.qq.com/cgi-bin/message/template/subscribe?access_token="
                + encode(accessToken), payload);
        String code = response.path("errcode").asText("-1");
        return new SendResult("0".equals(code), code, response.path("errmsg").asText("微信接口未返回说明"));
    }

    private String accessToken() {
        AccessToken current = cachedToken;
        long now = System.currentTimeMillis();
        if (current != null && current.expiresAt() - TOKEN_SAFETY_WINDOW.toMillis() > now) {
            return current.value();
        }
        synchronized (this) {
            current = cachedToken;
            if (current != null && current.expiresAt() - TOKEN_SAFETY_WINDOW.toMillis() > now) {
                return current.value();
            }
            requireSubscriptionConfiguration();
            var wechat = properties.getWechat();
            String url = "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid="
                    + encode(wechat.getAppId()) + "&secret=" + encode(wechat.getAppSecret());
            JsonNode body = getJson(url);
            String token = body.path("access_token").asText("");
            if (token.isBlank()) {
                throw new SupplierQuoteApiException(HttpStatus.BAD_GATEWAY, "WECHAT_ACCESS_TOKEN_FAILED",
                        "微信公众号 access_token 获取失败，请检查 AppID、AppSecret 和 IP 白名单");
            }
            cachedToken = new AccessToken(token, now + body.path("expires_in").asLong(7200) * 1000L);
            return token;
        }
    }

    private JsonNode getJson(String url) {
        return execute(HttpRequest.newBuilder(URI.create(url)).GET().build());
    }

    private JsonNode postJson(String url, JsonNode body) {
        try {
            return execute(HttpRequest.newBuilder(URI.create(url))
                    .header("Content-Type", "application/json; charset=UTF-8")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build());
        } catch (SupplierQuoteApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw unavailable(exception);
        }
    }

    private JsonNode execute(HttpRequest request) {
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw unavailable(null);
            return objectMapper.readTree(response.body());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw unavailable(exception);
        } catch (SupplierQuoteApiException exception) {
            throw exception;
        } catch (Exception exception) {
            throw unavailable(exception);
        }
    }

    private void requireSubscriptionConfiguration() {
        var wechat = properties.getWechat();
        if (wechat.getAppId().isBlank() || wechat.getAppSecret().isBlank()
                || wechat.getSubscriptionTemplateId().isBlank()
                || wechat.getSubscriptionCallbackUrl().isBlank()) {
            throw new SupplierQuoteApiException(HttpStatus.SERVICE_UNAVAILABLE, "WECHAT_SUBSCRIPTION_NOT_CONFIGURED",
                    "微信公众号一次性订阅参数尚未配置完整");
        }
    }

    private static SupplierQuoteApiException unavailable(Exception cause) {
        return new SupplierQuoteApiException(HttpStatus.BAD_GATEWAY, "WECHAT_SUBSCRIPTION_UNAVAILABLE",
                "微信订阅消息服务暂时不可用，请稍后重试");
    }

    private static String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private record AccessToken(String value, long expiresAt) {}
}
