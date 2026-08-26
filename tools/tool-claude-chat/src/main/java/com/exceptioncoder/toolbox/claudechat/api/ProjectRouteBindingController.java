package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ProjectRouteBindingRequest;
import com.exceptioncoder.toolbox.claudechat.api.dto.ProjectRouteBindingView;
import com.exceptioncoder.toolbox.claudechat.service.ProjectRouteBindingService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 管理 knowledge projectKey 与本机源码根的显式绑定。 */
@RestController
@RequestMapping("/api/claude-chat/project-route-bindings")
public class ProjectRouteBindingController {

    private final ProjectRouteBindingService service;

    public ProjectRouteBindingController(ProjectRouteBindingService service) {
        this.service = service;
    }

    /** 返回显式、托管、兼容和未绑定项目的合并视图。 */
    @GetMapping
    public List<ProjectRouteBindingView> list() {
        return service.list().stream().map(ProjectRouteBindingView::from).toList();
    }

    /** 保存一个显式本机绑定。 */
    @PutMapping("/{projectKey}")
    public ProjectRouteBindingView save(
            @PathVariable String projectKey,
            @Valid @RequestBody ProjectRouteBindingRequest request
    ) {
        return ProjectRouteBindingView.from(
                service.save(projectKey, request.projectPath(), request.aliases()));
    }

    /** 删除显式绑定并恢复内建或目录同名回退。 */
    @DeleteMapping("/{projectKey}")
    public ResponseEntity<Void> delete(@PathVariable String projectKey) {
        service.delete(projectKey);
        return ResponseEntity.noContent().build();
    }
}
