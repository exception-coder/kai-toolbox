package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.EngineUsageView;
import com.exceptioncoder.toolbox.claudechat.service.usage.UsageService;
import com.exceptioncoder.toolbox.claudechat.service.usage.SubscriptionQuotaService;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 引擎本地用量：扫描已启用引擎的本机会话日志，按 今日/近7天/近30天 聚合（60s 缓存）。 */
@RestController("claudeChatUsageController")
@RequestMapping("/api/claude-chat/usage")
public class UsageController {

    private final UsageService usage;
    private final SubscriptionQuotaService subscription;
    private final ClaudeChatSessionAccessPolicy access;

    public UsageController(UsageService usage, SubscriptionQuotaService subscription,
                           ClaudeChatSessionAccessPolicy access) {
        this.usage = usage;
        this.subscription = subscription;
        this.access = access;
    }

    @GetMapping("/subscription")
    public ResponseEntity<JsonNode> subscription(@RequestParam String sessionId) {
        if (!access.canAccessCurrentUser(sessionId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(subscription.read(sessionId));
    }

    @GetMapping
    public List<EngineUsageView> usage() {
        return usage.usage();
    }
}
