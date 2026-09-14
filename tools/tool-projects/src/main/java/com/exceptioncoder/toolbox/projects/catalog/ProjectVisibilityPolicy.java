package com.exceptioncoder.toolbox.projects.catalog;

import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.exceptioncoder.toolbox.common.project.ProjectPaths;
import org.springframework.stereotype.Component;
import java.nio.file.Path;

/** 排除整个项目及其子模块；每次读取最新配置，不依赖清单缓存。 */
@Component
public class ProjectVisibilityPolicy implements ProjectAccess {
    private final ProjectCatalogProperties properties;

    public ProjectVisibilityPolicy(ProjectCatalogProperties properties) { this.properties = properties; }

    @Override
    public boolean allowed(Path path) {
        Path normalized = ProjectPaths.canonical(path);
        return properties.getExcludedPaths().stream().map(Path::of).noneMatch(excluded ->
                normalized.startsWith(ProjectPaths.canonical(excluded))
                        || path.toAbsolutePath().normalize().startsWith(excluded.toAbsolutePath().normalize()));
    }
}
