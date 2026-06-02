package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.NotificationService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 通知诊断端点。{@code /test} 用前端传入的（草稿）配置当场发一条测试推送，
 * 便于在保存前验证 Bark/ntfy「后端 → 推送服务器 → 手机 App」整条链路是否通。
 */
@RestController
@RequestMapping("/api/claude-chat/notify")
public class ClaudeChatNotifyController {

    private final NotificationService notifications;

    public ClaudeChatNotifyController(NotificationService notifications) {
        this.notifications = notifications;
    }

    /**
     * 请求体为通知配置 {@code { "notify": { "ntfy": {...}, "bark": {...} } }}（即前端草稿）。
     * 返回实际尝试发送的渠道；未配置/未启用任何渠道则返回空列表。
     */
    @PostMapping("/test")
    public Map<String, Object> test(@RequestBody(required = false) JsonNode body) {
        JsonNode notify = body == null ? null : body.path("notify");
        List<String> channels = notifications.notifyWith(
                notify, "Claude 测试推送", "ntfy / Bark 推送链路正常 ✅");
        return Map.of("channels", channels);
    }
}
