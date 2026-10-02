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
    private final ClaudeQuotaClient claudeQuota;

    public SubscriptionQuotaService(ClaudeChatSessionRepository sessions, SidecarClient sidecar,
                                    ClaudeQuotaClient claudeQuota) {
        this.sessions = sessions;
        this.sidecar = sidecar;
        this.claudeQuota = claudeQuota;
    }

    public JsonNode read(String sessionId) {
        var session = sessions.findById(sessionId).orElse(null);
        if (session == null) {
            return unavailable("当前会话不存在");
        }
        String engine = session.getEngine() == null ? "claude" : session.getEngine();
        if (!"codex".equals(engine) && !"claude".equals(engine)) {
            return unavailable("此引擎暂未提供可核验的订阅额度");
        }
        if (nonBlank(session.getApiBaseUrl()) || nonBlank(session.getAuthToken())) {
            return unavailable("第三方或 API 计费会话没有可查询的订阅额度");
        }
        var quota = "claude".equals(engine)
                ? java.util.Optional.ofNullable(claudeSnapshot())
                : sidecar.querySubscriptionQuota(
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
                .orElseGet(() -> unavailable("订阅额度暂无法获取，请检查账号登录及额度接口后重试"));
    }

    private static boolean nonBlank(String value) {
        return value != null && !value.isBlank();
    }

    private JsonNode claudeSnapshot() {
        var snapshot = claudeQuota.get();
        if (snapshot == null) {
            return null;
        }
        var node = JsonNodeFactory.instance.objectNode();
        node.put("available", true);
        node.put("fetchedAt", snapshot.capturedAt());
        node.put("shared", true);
        node.put("planType", snapshot.planType());
        var windows = node.putArray("windows");
        appendWindow(windows, snapshot.primaryUsedPercent(), snapshot.primaryWindowMinutes(),
                snapshot.primaryResetsAt());
        appendWindow(windows, snapshot.secondaryUsedPercent(), snapshot.secondaryWindowMinutes(),
                snapshot.secondaryResetsAt());
        return node;
    }

    private static void appendWindow(com.fasterxml.jackson.databind.node.ArrayNode windows, Double used,
                                     Integer minutes, Long resetsAt) {
        if (used == null || minutes == null || minutes <= 0) {
            return;
        }
        var window = windows.addObject();
        window.put("windowMinutes", minutes);
        window.put("remainingPercent", 100 - used);
        if (resetsAt == null) {
            window.putNull("resetsAt");
        } else {
            window.put("resetsAt", resetsAt);
        }
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
