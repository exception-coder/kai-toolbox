package com.regentech_fashion.supplierquote.infrastructure;

import com.regentech_fashion.supplierquote.api.SupplierQuoteApiException;
import com.regentech_fashion.supplierquote.config.SupplierQuoteProperties;
import com.regentech_fashion.supplierquote.domain.WechatOAuthClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

public class ConfiguredWechatOAuthClient implements WechatOAuthClient {
    private final SupplierQuoteProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newHttpClient();

    public ConfiguredWechatOAuthClient(SupplierQuoteProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    @Override
    public String authorizationUrl(String state) {
        var wechat = properties.getWechat();
        return "https://open.weixin.qq.com/connect/oauth2/authorize?appid=" + encode(wechat.getAppId())
                + "&redirect_uri=" + encode(wechat.getCallbackUrl())
                + "&response_type=code&scope=snsapi_base&state=" + encode(state)
                + "#wechat_redirect";
    }

    @Override
    public String exchangeCode(String code) {
        var wechat = properties.getWechat();
        if (wechat.getAppId().isBlank() || wechat.getAppSecret().isBlank()) {
            throw new SupplierQuoteApiException(HttpStatus.SERVICE_UNAVAILABLE, "WECHAT_NOT_CONFIGURED",
                    "公众号 AppID 或 AppSecret 尚未配置");
        }
        String url = "https://api.weixin.qq.com/sns/oauth2/access_token?appid=" + encode(wechat.getAppId())
                + "&secret=" + encode(wechat.getAppSecret()) + "&code=" + encode(code)
                + "&grant_type=authorization_code";
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url)).GET().build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode body = objectMapper.readTree(response.body());
            String openid = body.path("openid").asText("");
            if (response.statusCode() != 200 || openid.isBlank()) {
                throw new SupplierQuoteApiException(HttpStatus.BAD_GATEWAY, "WECHAT_CODE_EXCHANGE_FAILED",
                        "微信静默授权未能完成，请从公众号消息重新进入");
            }
            return openid;
        } catch (SupplierQuoteApiException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new SupplierQuoteApiException(HttpStatus.BAD_GATEWAY, "WECHAT_CODE_EXCHANGE_FAILED",
                    "微信授权服务暂时不可用，请稍后重试");
        } catch (Exception exception) {
            throw new SupplierQuoteApiException(HttpStatus.BAD_GATEWAY, "WECHAT_CODE_EXCHANGE_FAILED",
                    "微信授权服务暂时不可用，请稍后重试");
        }
    }

    @Override public boolean isMock() { return "mock".equalsIgnoreCase(properties.getWechat().getMode()); }
    @Override public String mockOpenid() { return properties.getWechat().getMockOpenid(); }

    private static String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
