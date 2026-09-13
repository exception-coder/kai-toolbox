package com.exceptioncoder.toolbox.projects.registry.api;

import com.exceptioncoder.toolbox.projects.registry.application.ProjectGitWorkspaceService;
import com.exceptioncoder.toolbox.projects.registry.domain.ProjectGitWorkspace;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

/** 已登记项目 Git 工作区接口；不接受客户端路径或 Git 命令。 */
@RestController
@RequestMapping("/api/project-registry/{id}/git")
public class ProjectGitWorkspaceController {
    private final ProjectGitWorkspaceService service;

    public ProjectGitWorkspaceController(ProjectGitWorkspaceService service) {
        this.service = service;
    }

    /** 查询当前工作树与本地上游差异。 */
    @GetMapping
    public ProjectGitWorkspace read(@PathVariable String id) {
        return service.read(id);
    }

    /** 推送快照指向的提交，成功不依赖后续状态读取。 */
    @PostMapping("/push")
    public Map<String, String> push(@PathVariable String id, @RequestBody PushRequest request) {
        return Map.of("message", service.push(id, request.token()));
    }

    /** 用户查看过的工作区快照。 */
    public record PushRequest(/** 快照散列。 */ String token) { }
}
