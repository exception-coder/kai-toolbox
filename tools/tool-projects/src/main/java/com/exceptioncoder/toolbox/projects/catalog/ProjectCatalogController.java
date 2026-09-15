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
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void visibility(@jakarta.validation.Valid @RequestBody VisibilityInput input) {
        visibility.setExcluded(input.path(), input.excluded());
    }

    public record VisibilityInput(@jakarta.validation.constraints.NotBlank String path,
                                  @jakarta.validation.constraints.NotNull Boolean excluded) { }
}
