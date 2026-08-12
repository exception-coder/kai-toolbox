package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.BusinessWorkspaceProperties;
import com.exceptioncoder.toolbox.claudechat.config.WorkspaceProperties;
import org.springframework.stereotype.Service;

import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** 合并用户配置工作区与 kai-toolbox 托管业务源码根，供扫描和路径授权共同使用。 */
@Service
public class WorkspaceRootResolver {

    private final WorkspaceProperties workspaceProperties;
    private final BusinessWorkspaceProperties businessWorkspaceProperties;

    public WorkspaceRootResolver(WorkspaceProperties workspaceProperties,
                                 BusinessWorkspaceProperties businessWorkspaceProperties) {
        this.workspaceProperties = workspaceProperties;
        this.businessWorkspaceProperties = businessWorkspaceProperties;
    }

    public List<Path> roots() {
        Set<Path> roots = new LinkedHashSet<>();
        for (String configured : workspaceProperties.getRoots()) {
            if (configured == null || configured.isBlank()) {
                continue;
            }
            try {
                roots.add(Path.of(configured).toAbsolutePath().normalize());
            } catch (InvalidPathException ignored) {
                // 保持工作区列表可用，非法动态配置由扫描结果忽略。
            }
        }
        roots.add(businessWorkspaceProperties.resolveRoot());
        return List.copyOf(roots);
    }

    public boolean contains(Path path) {
        Path normalized = path.toAbsolutePath().normalize();
        return roots().stream().anyMatch(root -> normalized.equals(root) || normalized.startsWith(root));
    }
}
