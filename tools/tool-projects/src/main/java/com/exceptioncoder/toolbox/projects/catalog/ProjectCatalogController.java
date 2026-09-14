package com.exceptioncoder.toolbox.projects.catalog;

import com.exceptioncoder.toolbox.common.project.ProjectCatalog;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/** 项目清单与管理入口，业务规则位于目录和使用策略服务。 */
@RestController
@RequestMapping("/api/project-catalog")
public class ProjectCatalogController {
    private final ProjectCatalog catalog;
    private final ProjectVisibilityService visibility;

    public ProjectCatalogController(ProjectCatalog catalog, ProjectVisibilityService visibility) {
        this.catalog = catalog;
        this.visibility = visibility;
    }

    @GetMapping
    public List<ProjectCatalog.Entry> list(@RequestParam(defaultValue = "false") boolean includeExcluded) {
        return catalog.list(includeExcluded);
    }

    @PutMapping("/visibility")
    public void visibility(@RequestBody VisibilityInput input) {
        visibility.setExcluded(input.path(), input.excluded());
    }

    public record VisibilityInput(String path, boolean excluded) { }
}
