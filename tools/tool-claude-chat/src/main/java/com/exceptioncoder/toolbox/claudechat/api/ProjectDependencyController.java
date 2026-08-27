package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ProjectDependenciesRequest;
import com.exceptioncoder.toolbox.claudechat.api.dto.ProjectDependencyView;
import com.exceptioncoder.toolbox.claudechat.service.ProjectDependencyService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 项目工作台的长期依赖绑定接口。 */
@RestController
@RequestMapping("/api/claude-chat/project-dependencies")
public class ProjectDependencyController {

    private final ProjectDependencyService service;

    public ProjectDependencyController(ProjectDependencyService service) {
        this.service = service;
    }

    @GetMapping
    public List<ProjectDependencyView> list(@RequestParam String primaryPath) {
        return service.list(primaryPath).stream().map(ProjectDependencyView::from).toList();
    }

    @PutMapping
    public ResponseEntity<Void> replace(@RequestParam String primaryPath,
                                        @RequestBody(required = false) ProjectDependenciesRequest request) {
        if (request != null && request.dependencies() != null) {
            service.replaceBindings(primaryPath, request.dependencies());
        } else {
            service.replace(primaryPath, request == null ? List.of() : request.paths());
        }
        return ResponseEntity.noContent().build();
    }
}
