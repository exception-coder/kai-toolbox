package com.exceptioncoder.toolbox.aichat.api;

import com.exceptioncoder.toolbox.aichat.api.dto.UsageInfo;
import com.exceptioncoder.toolbox.aichat.service.UsageService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 当前 key 用量查询：{@code GET /api/ai-chat/usage}。 */
@RestController("aiChatUsageController")
@RequestMapping("/api/ai-chat/usage")
public class UsageController {

    private final UsageService usage;

    public UsageController(UsageService usage) {
        this.usage = usage;
    }

    @GetMapping
    public UsageInfo usage() {
        return usage.fetch();
    }
}
