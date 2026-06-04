package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import com.exceptioncoder.toolbox.claudechat.service.WorkspaceScanService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 工作目录查询：列出配置根目录下的一级子目录，供新建会话时下拉选 cwd。
 * 见设计文档：ai-docs/kai-toolbox/design/移动端 Claude 客户端/工作目录会话选择/
 */
@RestController
@RequestMapping("/api/claude-chat/workspaces")
public class WorkspaceController {

    private final WorkspaceScanService service;

    public WorkspaceController(WorkspaceScanService service) {
        this.service = service;
    }

    @GetMapping
    public WorkspaceListResponse list() {
        return service.scan();
    }
}
