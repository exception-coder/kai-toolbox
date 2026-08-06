package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceDirView;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse.RootView;
import com.exceptioncoder.toolbox.claudechat.repository.ProjectAliasRepository;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 项目别名应用服务，负责路径校验、持久化编排和工作区展示装饰。
 */
@Service
public class ProjectAliasService {

    private static final int MAX_ALIAS_LENGTH = 100;
    private static final boolean CASE_INSENSITIVE_PATH = File.separatorChar == '\\';

    private final ProjectAliasRepository repository;
    private final WorkspaceScanService workspaceScanService;

    public ProjectAliasService(ProjectAliasRepository repository, WorkspaceScanService workspaceScanService) {
        this.repository = repository;
        this.workspaceScanService = workspaceScanService;
    }

    /**
     * 为扫描结果合并别名，并计算统一展示名。
     *
     * @param workspaceList 原始工作区扫描结果
     * @return 带别名和展示名的工作区列表
     */
    public WorkspaceListResponse decorate(WorkspaceListResponse workspaceList) {
        Map<String, String> aliases = repository.findAll().entrySet().stream()
                .collect(Collectors.toMap(entry -> pathKey(entry.getKey()), Map.Entry::getValue));
        List<RootView> roots = workspaceList.roots().stream()
                .map(root -> decorateRoot(root, aliases))
                .toList();
        return new WorkspaceListResponse(roots, workspaceList.scannedAt());
    }

    /**
     * 保存或清除当前工作区项目的别名。
     *
     * @param projectPath 项目绝对路径
     * @param alias       新别名，空白表示清除
     */
    public void saveAlias(String projectPath, String alias) {
        String normalizedPath = normalizePath(projectPath);
        boolean workspaceProject = workspaceScanService.scan().roots().stream()
                .flatMap(root -> root.dirs().stream())
                .anyMatch(project -> pathKey(project.path()).equals(pathKey(normalizedPath)));
        if (!workspaceProject) {
            throw new IllegalArgumentException("项目路径不属于当前工作区");
        }

        String normalizedAlias = alias == null ? "" : alias.trim();
        if (normalizedAlias.length() > MAX_ALIAS_LENGTH) {
            throw new IllegalArgumentException("项目别名不能超过 100 个字符");
        }
        if (normalizedAlias.isEmpty()) {
            repository.delete(normalizedPath);
            return;
        }
        repository.upsert(normalizedPath, normalizedAlias);
    }

    private RootView decorateRoot(RootView root, Map<String, String> aliases) {
        List<WorkspaceDirView> dirs = root.dirs().stream()
                .map(project -> decorateProject(project, aliases))
                .toList();
        return new RootView(root.root(), root.exists(), dirs);
    }

    private WorkspaceDirView decorateProject(WorkspaceDirView project, Map<String, String> aliases) {
        String alias = aliases.get(pathKey(project.path()));
        String displayName = alias == null || alias.isBlank() ? project.name() : alias;
        return new WorkspaceDirView(project.name(), project.path(), alias, displayName);
    }

    private String normalizePath(String projectPath) {
        if (projectPath == null || projectPath.isBlank()) {
            throw new IllegalArgumentException("项目路径不能为空");
        }
        try {
            return Path.of(projectPath).toAbsolutePath().normalize().toString();
        } catch (InvalidPathException exception) {
            throw new IllegalArgumentException("项目路径格式无效", exception);
        }
    }

    private String pathKey(String projectPath) {
        String normalizedPath = normalizePath(projectPath);
        return CASE_INSENSITIVE_PATH ? normalizedPath.toLowerCase(Locale.ROOT) : normalizedPath;
    }
}
