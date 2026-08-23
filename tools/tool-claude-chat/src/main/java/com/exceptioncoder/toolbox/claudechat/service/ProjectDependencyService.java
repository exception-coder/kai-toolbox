package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import com.exceptioncoder.toolbox.claudechat.domain.ProjectDependency;
import com.exceptioncoder.toolbox.claudechat.repository.ProjectDependencyRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** 管理项目级长期依赖，并把目录引用解析成知识查询 projectKey。 */
@Service
public class ProjectDependencyService {

    public static final int MAX_DEPENDENCY_COUNT = 8;
    private static final boolean CASE_INSENSITIVE_PATH = File.separatorChar == '\\';

    private final ProjectDependencyRepository repository;
    private final WorkspaceScanService workspaceScanService;

    public ProjectDependencyService(ProjectDependencyRepository repository,
                                    WorkspaceScanService workspaceScanService) {
        this.repository = repository;
        this.workspaceScanService = workspaceScanService;
    }

    public List<ProjectDependency> list(String primaryProjectPath) {
        String normalizedPrimary = requireWorkspaceProject(primaryProjectPath, "主项目路径不属于当前工作区");
        return resolveNormalized(normalizedPrimary);
    }

    /** 运行时解析已保存引用，不因项目从工作区移除或源码缺失而阻断会话。 */
    public List<ProjectDependency> resolve(String primaryProjectPath) {
        String normalizedPrimary = normalizeRequiredPath(primaryProjectPath, "主项目路径不能为空");
        return resolveNormalized(normalizedPrimary);
    }

    @Transactional
    public void replace(String primaryProjectPath, List<String> requestedPaths) {
        String normalizedPrimary = requireWorkspaceProject(primaryProjectPath, "主项目路径不属于当前工作区");
        List<String> safeRequests = requestedPaths == null ? List.of() : requestedPaths;
        Map<String, String> allowed = workspaceProjects();
        String primaryKey = pathKey(normalizedPrimary);
        Map<String, String> unique = new LinkedHashMap<>();
        for (String requestedPath : safeRequests) {
            if (requestedPath == null || requestedPath.isBlank()) continue;
            String requestedKey = pathKey(requestedPath);
            if (requestedKey.equals(primaryKey)) {
                throw new IllegalArgumentException("项目不能依赖自身");
            }
            String allowedPath = allowed.get(requestedKey);
            if (allowedPath == null) {
                throw new IllegalArgumentException("依赖项目不在项目工作台可用目录中: " + requestedPath);
            }
            unique.putIfAbsent(requestedKey, allowedPath);
        }
        if (unique.size() > MAX_DEPENDENCY_COUNT) {
            throw new IllegalArgumentException("每个项目最多关联 " + MAX_DEPENDENCY_COUNT + " 个依赖项目");
        }
        repository.replace(normalizedPrimary, new ArrayList<>(unique.values()), System.currentTimeMillis());
    }

    private List<ProjectDependency> resolveNormalized(String normalizedPrimary) {
        Path knowledgeRoot = Path.of(workspaceScanService.knowledgeDirectory());
        return repository.findPaths(normalizedPrimary).stream()
                .map(path -> resolveDependency(path, knowledgeRoot))
                .toList();
    }

    private ProjectDependency resolveDependency(String storedPath, Path knowledgeRoot) {
        try {
            Path source = Path.of(storedPath).toAbsolutePath().normalize();
            String normalizedPath = source.toString();
            String projectKey = source.getFileName() == null ? normalizedPath : source.getFileName().toString();
            return new ProjectDependency(
                    normalizedPath,
                    projectKey,
                    Files.isDirectory(source),
                    Files.isDirectory(knowledgeRoot.resolve(projectKey)));
        } catch (InvalidPathException exception) {
            return new ProjectDependency(storedPath, storedPath, false, false);
        }
    }

    private String requireWorkspaceProject(String projectPath, String message) {
        String normalized = normalizeRequiredPath(projectPath, "项目路径不能为空");
        String allowed = workspaceProjects().get(pathKey(normalized));
        if (allowed == null) throw new IllegalArgumentException(message);
        return allowed;
    }

    private Map<String, String> workspaceProjects() {
        Map<String, String> projects = new LinkedHashMap<>();
        WorkspaceListResponse workspaces = workspaceScanService.scan();
        workspaces.roots().stream()
                .filter(WorkspaceListResponse.RootView::exists)
                .flatMap(root -> root.dirs().stream())
                .forEach(project -> {
                    String normalized = normalizeRequiredPath(project.path(), "工作区项目路径无效");
                    projects.put(pathKey(normalized), normalized);
                });
        return projects;
    }

    private String normalizeRequiredPath(String projectPath, String emptyMessage) {
        if (projectPath == null || projectPath.isBlank()) throw new IllegalArgumentException(emptyMessage);
        try {
            return Path.of(projectPath).toAbsolutePath().normalize().toString();
        } catch (InvalidPathException exception) {
            throw new IllegalArgumentException("项目路径格式无效", exception);
        }
    }

    private String pathKey(String projectPath) {
        String normalized = normalizeRequiredPath(projectPath, "项目路径不能为空");
        return CASE_INSENSITIVE_PATH ? normalized.toLowerCase(Locale.ROOT) : normalized;
    }
}
