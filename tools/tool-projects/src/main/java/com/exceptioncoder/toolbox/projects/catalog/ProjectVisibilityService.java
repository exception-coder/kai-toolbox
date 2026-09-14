package com.exceptioncoder.toolbox.projects.catalog;

import com.exceptioncoder.toolbox.common.dynamicconfig.service.DynamicConfigService;
import com.exceptioncoder.toolbox.common.project.ProjectCatalog;
import com.exceptioncoder.toolbox.common.project.ProjectPaths;
import org.springframework.stereotype.Service;
import java.nio.file.Path;
import java.util.*;

/** 集中修改使用范围；单次修改在平台配置事务中持久化。 */
@Service
public class ProjectVisibilityService {
    private static final String BLOCK = "toolbox.projects.catalog";
    private static final String KEY = BLOCK + ".excluded-paths";
    private final ProjectCatalog catalog;
    private final ProjectCatalogProperties properties;
    private final DynamicConfigService configs;

    public ProjectVisibilityService(ProjectCatalog catalog, ProjectCatalogProperties properties, DynamicConfigService configs) {
        this.catalog = catalog;
        this.properties = properties;
        this.configs = configs;
    }

    public synchronized void setExcluded(String path, boolean excluded) {
        if (path == null || path.isBlank() || !Path.of(path).isAbsolute()) {
            throw new IllegalArgumentException("请选择完整项目路径");
        }
        Path canonical = ProjectPaths.canonical(Path.of(path));
        boolean known = catalog.list(true).stream().anyMatch(item -> Path.of(item.path()).equals(canonical));
        if (!known) throw new IllegalArgumentException("项目不在统一目录清单中，请刷新后重试");
        Set<String> paths = new LinkedHashSet<>(properties.getExcludedPaths());
        paths.removeIf(value -> ProjectPaths.canonical(Path.of(value)).equals(canonical));
        if (!excluded && paths.stream().anyMatch(value -> canonical.startsWith(ProjectPaths.canonical(Path.of(value))))) {
            throw new IllegalArgumentException("上级项目仍被排除，请先在全部目录中恢复上级项目");
        }
        if (excluded) paths.add(canonical.toString());
        Map<String, String> values = new LinkedHashMap<>();
        if (paths.isEmpty()) values.put(KEY, "");
        int index = 0;
        for (String value : paths) values.put(KEY + "[" + index++ + "]", value);
        configs.applyOverrides(BLOCK, values, List.of(KEY));
    }
}
