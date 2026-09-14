package com.exceptioncoder.toolbox.projects.catalog;

import com.exceptioncoder.toolbox.common.dynamicconfig.annotation.Refreshable;
import com.exceptioncoder.toolbox.common.dynamicconfig.registry.DynamicConfigValidatable;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import java.nio.file.Path;
import java.util.List;

/** 项目领域使用策略，复用平台配置持久化与热更新。 */
@Component
@ConfigurationProperties(prefix = "toolbox.projects.catalog")
@Refreshable(name = "项目使用范围")
@Getter
@Setter
public class ProjectCatalogProperties implements DynamicConfigValidatable {
    private List<String> excludedPaths = List.of();

    @Override
    public void validateConfiguration() {
        if (excludedPaths == null || excludedPaths.size() > 10000) {
            throw new IllegalArgumentException("排除目录数量无效");
        }
        for (String value : excludedPaths) {
            if (value == null || value.isBlank() || !Path.of(value).isAbsolute()) {
                throw new IllegalArgumentException("排除目录必须是完整绝对路径");
            }
        }
    }
}
