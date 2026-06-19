package com.exceptioncoder.toolbox.aichat.service;

import com.exceptioncoder.toolbox.aichat.api.dto.UsageInfo;
import com.exceptioncoder.toolbox.aichat.config.AiChatProperties;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * 当前 key 的用量查询：调网关 {@code GET /api/usage/token}（凭 key 即可，无需管理员账号）。
 * 把 New API 内部额度换算成美元。请求级/按模型/按天明细需账号登录态，不在此范围。
 */
@Service("aiChatUsageService")
public class UsageService {

    private static final Logger log = LoggerFactory.getLogger(UsageService.class);

    private final AiChatProperties props;
    private final RestClient rest = RestClient.create();

    public UsageService(AiChatProperties props) {
        this.props = props;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record TokenUsageResponse(Data data) {
        @JsonIgnoreProperties(ignoreUnknown = true)
        private record Data(String name, Boolean unlimited_quota, Long expires_at,
                            Double total_used, Double total_granted, Double total_available) {
        }
    }

    public UsageInfo fetch() {
        if (props.getApiKey() == null || props.getApiKey().isBlank()) {
            return UsageInfo.unavailable("未配置 api-key");
        }
        try {
            TokenUsageResponse resp = rest.get()
                    .uri(usageUrl())
                    .header("Authorization", "Bearer " + props.getApiKey())
                    .retrieve()
                    .body(TokenUsageResponse.class);
            if (resp == null || resp.data() == null) {
                return UsageInfo.unavailable("网关未返回用量数据");
            }
            TokenUsageResponse.Data d = resp.data();
            double unit = props.getQuotaPerUnit() > 0 ? props.getQuotaPerUnit() : 500000;
            boolean unlimited = Boolean.TRUE.equals(d.unlimited_quota());
            Double used = d.total_used() != null ? d.total_used() / unit : null;
            Double granted = d.total_granted() != null && d.total_granted() > 0 ? d.total_granted() / unit : null;
            Double remaining = unlimited || d.total_available() == null ? null : d.total_available() / unit;
            Long expires = d.expires_at() != null && d.expires_at() > 0 ? d.expires_at() : null;
            return new UsageInfo(true, d.name(), unlimited, expires, props.getCurrencySymbol(), used, granted, remaining, null);
        } catch (RuntimeException e) {
            log.warn("[ai-chat] 查询用量失败: {}", e.toString());
            return UsageInfo.unavailable(e.getMessage());
        }
    }

    /**
     * 由 base-url 推导 usage 端点：去掉末尾 /v1，拼 /api/usage/token/。
     * 末尾斜杠不能省——网关对无斜杠路径会 301 到带斜杠版本，而 JDK HttpClient（RestClient 底层）
     * 默认不跟随重定向，会拿到 301 的 HTML 页面导致解析失败。
     */
    private String usageUrl() {
        String base = props.getBaseUrl();
        String origin = base.endsWith("/v1") ? base.substring(0, base.length() - 3)
                : base.endsWith("/v1/") ? base.substring(0, base.length() - 4) : base;
        if (origin.endsWith("/")) {
            origin = origin.substring(0, origin.length() - 1);
        }
        return origin + "/api/usage/token/";
    }
}
