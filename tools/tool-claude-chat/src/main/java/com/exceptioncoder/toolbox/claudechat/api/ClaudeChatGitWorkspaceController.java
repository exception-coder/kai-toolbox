package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.SessionGitRepositoryService;
import com.exceptioncoder.toolbox.common.git.GitBranchSwitchPreview;
import com.exceptioncoder.toolbox.common.git.GitWorkspaceOperations;
import com.exceptioncoder.toolbox.common.git.GitWorkspaceStatus;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Path;
import java.util.Map;

/** 会话仓库身份沿用现有关联解析与全局目录授权。 */
@RestController
@RequestMapping("/api/claude-chat/sessions/{id}/git")
public class ClaudeChatGitWorkspaceController {
    private final SessionGitRepositoryService repositories;
    private final ProjectAccess access;
    private final GitWorkspaceOperations workspace;

    public ClaudeChatGitWorkspaceController(SessionGitRepositoryService repositories, ProjectAccess access,
                                            GitWorkspaceOperations workspace) {
        this.repositories = repositories;
        this.access = access;
        this.workspace = workspace;
    }

    @GetMapping("/workspace")
    public GitWorkspaceStatus status(@PathVariable String id, @RequestParam(required = false) String repo) {
        return workspace.status(root(id, repo), false);
    }

    @PostMapping("/workspace-refresh")
    public GitWorkspaceStatus refresh(@PathVariable String id, @RequestParam(required = false) String repo) {
        return workspace.status(root(id, repo), true);
    }

    @PostMapping("/switch-preview")
    public GitBranchSwitchPreview prepare(@PathVariable String id, @RequestParam(required = false) String repo,
                                          @RequestBody SwitchRequest request) {
        return workspace.prepareSwitch(root(id, repo), request.ref());
    }

    @PostMapping("/switch")
    public Map<String, String> execute(@PathVariable String id, @RequestParam(required = false) String repo,
                                       @RequestBody SwitchRequest request) {
        return Map.of("message", workspace.switchBranch(root(id, repo), request.ref(), request.token()));
    }

    private Path root(String id, String repo) {
        Path root = repositories.resolve(id, repo);
        access.requireAllowed(root);
        return root;
    }

    public record SwitchRequest(String ref, String token) { }
}
