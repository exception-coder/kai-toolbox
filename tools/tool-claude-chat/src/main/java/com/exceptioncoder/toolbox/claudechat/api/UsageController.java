package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.EngineUsageView;
import com.exceptioncoder.toolbox.claudechat.service.usage.UsageService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 引擎本地用量：扫本机 Claude/Codex/Gemini 会话日志，按 今日/近7天/近30天 聚合（60s 缓存）。 */
@RestController
@RequestMapping("/api/claude-chat/usage")
public class UsageController {

    private final UsageService usage;

    public UsageController(UsageService usage) {
        this.usage = usage;
    }

    @GetMapping
    public List<EngineUsageView> usage() {
        return usage.usage();
    }
}
