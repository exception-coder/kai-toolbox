package com.exceptioncoder.toolbox.common.forge.config;

import com.exceptioncoder.toolbox.common.forge.model.PermissionType;
import com.exceptioncoder.toolbox.common.forge.model.PermissionDef;
import com.exceptioncoder.toolbox.common.forge.service.PermissionContributor;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 应用菜单权限贡献者。
 *
 * <p>菜单元数据不再在 Java 中重复声明。前端构建会从所有 {@code FeatureManifest} 生成
 * {@code feature-menu-permissions.json}，这里仅负责加载并转换成 {@link PermissionDef}。
 * 因此前端 manifest 是菜单名称、分类、排序和权限码的唯一人工维护源。</p>
 */
@Component
@ConditionalOnProperty(prefix = "toolbox.auth", name = "enabled", havingValue = "true")
public class MenuPermissions implements PermissionContributor {

    private static final Logger log = LoggerFactory.getLogger(MenuPermissions.class);
    private static final String RESOURCE_PATH = "static/feature-menu-permissions.json";
    private static final String CONFIG_PATH = "toolbox.feature-menu-catalog.path";

    private final List<PermissionDef> permissions;

    public MenuPermissions(ObjectMapper objectMapper, Environment environment) {
        LoadedCatalog loaded = loadCatalog(objectMapper, environment);
        this.permissions = toPermissionDefs(loaded.catalog());
        log.info("已从 {} 加载 FeatureManifest 菜单权限目录：{} 项", loaded.source(), permissions.size());
    }

    @Override
    public List<PermissionDef> permissions() {
        return permissions;
    }

    private LoadedCatalog loadCatalog(ObjectMapper objectMapper, Environment environment) {
        String configuredPath = environment.getProperty(CONFIG_PATH);
        if (configuredPath != null && !configuredPath.isBlank()) {
            Path path = Path.of(configuredPath).toAbsolutePath().normalize();
            if (!Files.isRegularFile(path)) {
                throw new IllegalStateException("配置的 FeatureManifest 权限目录不存在：" + path);
            }
            return new LoadedCatalog(read(objectMapper, path), path.toString());
        }

        // spring-boot:run / IDE 开发态：直接读取前端生成目录。兼容从仓库根或 toolbox-starter 启动。
        for (Path candidate : List.of(
                Path.of("frontend", "public", "feature-menu-permissions.json"),
                Path.of("..", "frontend", "public", "feature-menu-permissions.json"))) {
            Path normalized = candidate.toAbsolutePath().normalize();
            if (Files.isRegularFile(normalized)) {
                return new LoadedCatalog(read(objectMapper, normalized), normalized.toString());
            }
        }

        // fat jar：frontend/dist 已复制到 classpath:/static。
        ClassPathResource resource = new ClassPathResource(RESOURCE_PATH);
        if (resource.exists()) {
            try (InputStream input = resource.getInputStream()) {
                return new LoadedCatalog(objectMapper.readValue(input, FeatureMenuCatalog.class),
                        "classpath:/" + RESOURCE_PATH);
            } catch (IOException e) {
                throw new IllegalStateException("读取 FeatureManifest 权限目录失败：classpath:/" + RESOURCE_PATH, e);
            }
        }

        throw new IllegalStateException(
                "缺少 FeatureManifest 权限目录。请在 frontend 执行 `npm run feature-catalog:generate`，"
                        + "或通过 " + CONFIG_PATH + " 指定目录文件。");
    }

    private FeatureMenuCatalog read(ObjectMapper objectMapper, Path path) {
        try (InputStream input = Files.newInputStream(path)) {
            return objectMapper.readValue(input, FeatureMenuCatalog.class);
        } catch (IOException e) {
            throw new IllegalStateException("读取 FeatureManifest 权限目录失败：" + path, e);
        }
    }

    private List<PermissionDef> toPermissionDefs(FeatureMenuCatalog catalog) {
        if (catalog.schemaVersion() != 1) {
            throw new IllegalStateException("不支持的 FeatureManifest 权限目录版本：" + catalog.schemaVersion());
        }
        if (catalog.permissions() == null || catalog.permissions().isEmpty()) {
            throw new IllegalStateException("FeatureManifest 权限目录为空，拒绝启动权限同步");
        }

        Set<String> codes = new LinkedHashSet<>();
        return catalog.permissions().stream().map(item -> {
            requireText(item.featureId(), "featureId");
            requireText(item.code(), "code");
            requireText(item.name(), "name");
            requireText(item.module(), "module");
            if (!codes.add(item.code())) {
                throw new IllegalStateException("FeatureManifest 权限目录包含重复 code：" + item.code());
            }
            return new PermissionDef(item.code(), item.name(), PermissionType.MENU,
                    item.module(), null, item.sort());
        }).toList();
    }

    private void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("FeatureManifest 权限目录字段不能为空：" + field);
        }
    }

    private record FeatureMenuCatalog(int schemaVersion, String generatedFrom, List<FeatureMenuItem> permissions) {}

    private record FeatureMenuItem(
            String featureId,
            String code,
            String name,
            String module,
            int sort
    ) {}

    private record LoadedCatalog(FeatureMenuCatalog catalog, String source) {}
}
