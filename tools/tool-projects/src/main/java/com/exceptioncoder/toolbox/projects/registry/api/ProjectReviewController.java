package com.exceptioncoder.toolbox.projects.registry.api;

import com.exceptioncoder.toolbox.common.git.GitReviewService;
import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.projects.registry.application.ProjectRegistryService;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.nio.file.Path;

/** Project-scoped, read-only review; request parameters never choose a filesystem root. */
@RestController
@RequireAuth
@RequestMapping("/api/project-registry/{id}/review")
public class ProjectReviewController {
    private final ProjectRegistryService projects;
    private final GitReviewService review;
    private final ProjectAccess access;
    public ProjectReviewController(ProjectRegistryService projects, GitReviewService review, ProjectAccess access) {
        this.projects = projects; this.review = review; this.access = access;
    }
    private Path root(String id) throws IOException {
        var principal = AuthContext.current().orElse(null);
        if (principal != null && !principal.hasAnyRole("ADMIN") && !principal.hasPermission("menu:project-workspace"))
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "无权查看项目库源码");
        Path root = Path.of(projects.require(id).metadata().localPath()).toRealPath();
        access.requireAllowed(root);
        return root;
    }
    @GetMapping("/info")
    public GitReviewService.Info info(@PathVariable String id) throws IOException { return review.info(root(id)); }
    @GetMapping("/tree")
    public GitReviewService.Tree tree(@PathVariable String id, @RequestParam(defaultValue="HEAD") String ref,
            @RequestParam(defaultValue="") String path, @RequestParam(defaultValue="0") int offset) throws IOException {
        return review.tree(root(id), ref, path, offset);
    }
    @GetMapping("/history")
    public GitReviewService.History history(@PathVariable String id, @RequestParam(defaultValue="HEAD") String ref,
            @RequestParam(defaultValue="0") int offset) throws IOException { return review.history(root(id), ref, offset); }
    @GetMapping("/changes")
    public GitReviewService.Changes changes(@PathVariable String id, @RequestParam String commit) throws IOException {
        return review.changes(root(id), commit);
    }
    @GetMapping("/workspace")
    public GitReviewService.Changes workspace(@PathVariable String id, @RequestParam(defaultValue="combined") String layer) throws IOException {
        return review.workspace(root(id), layer);
    }
    @GetMapping("/source")
    public GitReviewService.Content source(@PathVariable String id, @RequestParam(defaultValue="HEAD") String ref,
            @RequestParam String path) throws IOException { return review.source(root(id), ref, path); }
    @GetMapping("/difference")
    public GitReviewService.Content difference(@PathVariable String id, @RequestParam String commit, @RequestParam String path,
            @RequestParam(defaultValue="combined") String layer) throws IOException { return review.difference(root(id), commit, path, layer); }
}
