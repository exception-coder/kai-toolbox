package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.OnboardView;
import com.exceptioncoder.toolbox.claudechat.service.OnboardService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 「项目初始化流水线」进度查询：镜像 yoooni-onboard-pipeline 写在 ~/.kai-toolbox/onboard-*.json 的状态，
 * 供工作台「更多功能」展示六阶段进度。只读——流水线推进在 Vibe Coding 会话里由 skill 驱动。
 */
@RestController
@RequestMapping("/api/claude-chat/onboard")
public class OnboardController {

    private final OnboardService service;

    public OnboardController(OnboardService service) {
        this.service = service;
    }

    @GetMapping
    public List<OnboardView> list() {
        return service.list();
    }
}
