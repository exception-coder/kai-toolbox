package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.BusinessWorkspaceProperties;
import com.exceptioncoder.toolbox.claudechat.config.WorkspaceProperties;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import com.exceptioncoder.toolbox.common.project.ProjectDirectorySource;
import com.exceptioncoder.toolbox.common.project.LegacyProjectDirectory;

import java.nio.file.InvalidPathException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** 合并用户配置工作区与 kai-toolbox 托管业务源码根，供扫描和路径授权共同使用。 */
@Service
public class WorkspaceRootResolver implements ProjectDirectorySource {

    private final WorkspaceProperties workspaceProperties;
    private final BusinessWorkspaceProperties businessWorkspaceProperties;
    private LegacyProjectDirectory legacyDirectory;

    @Autowired(required = false)
    public void setLegacyDirectory(LegacyProjectDirectory legacyDirectory) {
        this.legacyDirectory = legacyDirectory;
    }

    @Override
    public List<String> hiddenPrefixes() { return workspaceProperties.getHiddenPrefixes(); }

    @Override
    public int cacheTtlSeconds() { return workspaceProperties.getCacheTtlSeconds(); }

    public WorkspaceRootResolver(WorkspaceProperties workspaceProperties,
                                 BusinessWorkspaceProperties businessWorkspaceProperties) {
        this.workspaceProperties = workspaceProperties;
        this.businessWorkspaceProperties = businessWorkspaceProperties;
    }

    public List<Path> roots() {
        return resolveRoots(true);
    }

    /** 扫描不报告尚未使用的默认托管目录；授权仍包含该目录以支持首次创建。 */
    public List<Path> scanRoots() {
        return resolveRoots(false);
    }

    private List<Path> resolveRoots(boolean includeUnusedDefault) {
        Set<Path> roots = new LinkedHashSet<>();
        List<String> configuredRoots = new java.util.ArrayList<>(workspaceProperties.getRoots());
        if (!workspaceProperties.isDirectoriesUnified() && legacyDirectory != null) {
            configuredRoots.add(legacyDirectory.getRoot());
        }
        for (String configured : configuredRoots) {
            if (configured == null || configured.isBlank()) {
                continue;
            }
            try {
                roots.add(Path.of(configured).toAbsolutePath().normalize());
            } catch (InvalidPathException ignored) {
                // 保持工作区列表可用，非法动态配置由扫描结果忽略。
            }
        }
        Path managed = businessWorkspaceProperties.resolveRoot();
        String configuredManaged = businessWorkspaceProperties.getRoot();
        if (includeUnusedDefault || (configuredManaged != null && !configuredManaged.isBlank())
                || !Files.notExists(managed)) {
            roots.add(managed);
        }
        return List.copyOf(roots);
    }

    public boolean contains(Path path) {
        Path normalized = path.toAbsolutePath().normalize();
        return roots().stream().anyMatch(root -> normalized.equals(root) || normalized.startsWith(root));
    }
}
