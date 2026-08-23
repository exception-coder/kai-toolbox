package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.OpenSpecProjectService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Vibe Coding 项目的 OpenSpec 检测与初始化接口。 */
@RestController("claudeChatOpenSpecProjectController")
@RequestMapping("/api/claude-chat/openspec")
public class OpenSpecProjectController {

    private final OpenSpecProjectService service;

    public OpenSpecProjectController(OpenSpecProjectService service) {
        this.service = service;
    }

    /** 返回目标项目当前的 OpenSpec root 状态。 */
    @PostMapping("/status")
    public OpenSpecProjectService.ProjectStatus status(
            @RequestBody OpenSpecProjectService.ProjectRequest request) {
        return service.status(request);
    }

    /** 在用户确认后初始化 OpenSpec，并返回复核结果。 */
    @PostMapping("/initialize")
    public OpenSpecProjectService.ProjectStatus initialize(
            @RequestBody OpenSpecProjectService.ProjectRequest request) {
        return service.initialize(request);
    }
}
