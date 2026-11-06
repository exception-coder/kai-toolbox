package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.SessionGitRepositoryService;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.common.git.GitReviewService;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import org.springframework.web.bind.annotation.*;

/** Reuses the session's authorized repository projection; never accepts an absolute project path. */
@RestController
@RequireAuth
@RequestMapping("/api/claude-chat/sessions/{id}/review")
public class SessionReviewController {
    private final SessionGitRepositoryService repositories;
    private final GitReviewService review;
    private final ClaudeChatSessionAccessPolicy access;
    public SessionReviewController(SessionGitRepositoryService repositories, GitReviewService review, ClaudeChatSessionAccessPolicy access) {
        this.repositories = repositories; this.review = review; this.access = access;
    }
    private java.nio.file.Path root(String id, String repo) {
        if (!access.canAccessCurrentUser(id)) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "无权查看该会话项目");
        return repositories.resolve(id, repo);
    }
    @GetMapping("/info")
    public GitReviewService.Info info(@PathVariable String id, @RequestParam(required=false) String repo) { return review.info(root(id, repo)); }
    @GetMapping("/tree")
    public GitReviewService.Tree tree(@PathVariable String id, @RequestParam(required=false) String repo,
            @RequestParam(defaultValue="HEAD") String ref, @RequestParam(defaultValue="") String path,
            @RequestParam(defaultValue="0") int offset) { return review.tree(root(id, repo), ref, path, offset); }
    @GetMapping("/history")
    public GitReviewService.History history(@PathVariable String id, @RequestParam(required=false) String repo,
            @RequestParam(defaultValue="HEAD") String ref, @RequestParam(defaultValue="0") int offset) {
        return review.history(root(id, repo), ref, offset);
    }
    @GetMapping("/changes")
    public GitReviewService.Changes changes(@PathVariable String id, @RequestParam(required=false) String repo,
            @RequestParam String commit) { return review.changes(root(id, repo), commit); }
    @GetMapping("/workspace")
    public GitReviewService.Changes workspace(@PathVariable String id, @RequestParam(required=false) String repo,
            @RequestParam(defaultValue="combined") String layer) { return review.workspace(root(id, repo), layer); }
    @GetMapping("/source")
    public GitReviewService.Content source(@PathVariable String id, @RequestParam(required=false) String repo,
            @RequestParam(defaultValue="HEAD") String ref, @RequestParam String path) {
        return review.source(root(id, repo), ref, path);
    }
    @GetMapping("/difference")
    public GitReviewService.Content difference(@PathVariable String id, @RequestParam(required=false) String repo,
            @RequestParam String commit, @RequestParam String path, @RequestParam(defaultValue="combined") String layer) {
        return review.difference(root(id, repo), commit, path, layer);
    }
}
