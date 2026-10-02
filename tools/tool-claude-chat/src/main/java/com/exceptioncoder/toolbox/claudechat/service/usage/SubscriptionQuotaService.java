package com.exceptioncoder.toolbox.claudechat.service.usage;

import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.SidecarClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.springframework.stereotype.Service;

/** 配额来自当前会话的官方账号；本地日志和费用不能作为余额来源。 */
@Service
public class SubscriptionQuotaService {
    private static final long QUERY_TIMEOUT_MS = 45_000;
    private final ClaudeChatSessionRepository sessions;
    private final SidecarClient sidecar;

    public SubscriptionQuotaService(ClaudeChatSessionRepository sessions, SidecarClient sidecar) {
        this.sessions = sessions;
        this.sidecar = sidecar;
    }

    public JsonNode read(String sessionId) {
        var session = sessions.findById(sessionId).orElse(null);
        if (session == null) {
            return unavailable("当前会话不存在");
        }
        if (!"codex".equals(session.getEngine())) {
            return unavailable("此引擎暂未提供可核验的订阅额度");
        }
        if (nonBlank(session.getApiBaseUrl()) || nonBlank(session.getAuthToken())) {
            return unavailable("第三方或 API 计费会话没有可查询的订阅额度");
        }
        var quota = sidecar.querySubscriptionQuota(
                session.getCodexHome(), session.getSelectedModel(), QUERY_TIMEOUT_MS);
        // 读取期间的配置切换使结果失效，不把旧路由快照当成新账号数据。
        var current = sessions.findById(sessionId).orElse(null);
        if (current == null || !java.util.Objects.equals(session.getCodexHome(), current.getCodexHome())
                || !java.util.Objects.equals(session.getEngine(), current.getEngine())
                || !java.util.Objects.equals(session.getSelectedModel(), current.getSelectedModel())
                || !java.util.Objects.equals(session.getApiBaseUrl(), current.getApiBaseUrl())
                || !java.util.Objects.equals(session.getAuthToken(), current.getAuthToken())) {
            return unavailable("会话配置已变化，请重新获取");
        }
        return quota.filter(value -> value.isObject() && value.path("available").isBoolean())
                .orElseGet(() -> unavailable("订阅额度暂无法获取，请检查 Sidecar 状态后重试"));
    }

    private static boolean nonBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static JsonNode unavailable(String message) {
        var node = JsonNodeFactory.instance.objectNode();
        node.put("available", false);
        node.put("message", message);
        node.putNull("fetchedAt");
        node.put("shared", true);
        node.putArray("windows");
        return node;
    }
}
