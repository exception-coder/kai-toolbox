package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.ProjectDependencyInput;
import com.exceptioncoder.toolbox.claudechat.domain.ProjectDependency;
import com.exceptioncoder.toolbox.claudechat.domain.ProjectDependencyBinding;
import com.exceptioncoder.toolbox.claudechat.repository.ProjectDependencyRepository;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceRelation;
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
        List<ProjectDependencyInput> inputs = requestedPaths == null ? List.of() : requestedPaths.stream()
                .map(path -> new ProjectDependencyInput(path, null, ProjectEvidenceRelation.DEPENDS_ON.name()))
                .toList();
        replaceBindings(primaryProjectPath, inputs);
    }

    /** 保存带关系语义的受控项目绑定。 */
    @Transactional
    public void replaceBindings(String primaryProjectPath, List<ProjectDependencyInput> requestedBindings) {
        String normalizedPrimary = requireWorkspaceProject(primaryProjectPath, "主项目路径不属于当前工作区");
        List<ProjectDependencyInput> safeRequests = requestedBindings == null ? List.of() : requestedBindings;
        Map<String, String> allowed = workspaceProjects();
        String primaryKey = pathKey(normalizedPrimary);
        Map<String, ProjectDependencyBinding> unique = new LinkedHashMap<>();
        for (ProjectDependencyInput request : safeRequests) {
            String requestedPath = request == null ? null : request.projectPath();
            if (requestedPath == null || requestedPath.isBlank()) continue;
            String requestedKey = pathKey(requestedPath);
            if (requestedKey.equals(primaryKey)) {
                throw new IllegalArgumentException("项目不能依赖自身");
            }
            String allowedPath = allowed.get(requestedKey);
            if (allowedPath == null) {
                throw new IllegalArgumentException("依赖项目不在项目工作台可用目录中: " + requestedPath);
            }
            String projectKey = normalizedProjectKey(request.projectKey(), allowedPath);
            String relation = normalizedRelation(request.relation());
            unique.putIfAbsent(requestedKey, new ProjectDependencyBinding(allowedPath, projectKey, relation));
        }
        if (unique.size() > MAX_DEPENDENCY_COUNT) {
            throw new IllegalArgumentException("每个项目最多关联 " + MAX_DEPENDENCY_COUNT + " 个依赖项目");
        }
        repository.replace(normalizedPrimary, new ArrayList<>(unique.values()), System.currentTimeMillis());
    }

    private List<ProjectDependency> resolveNormalized(String normalizedPrimary) {
        Path knowledgeRoot = Path.of(workspaceScanService.knowledgeDirectory());
        return repository.findBindings(normalizedPrimary).stream()
                .map(binding -> resolveDependency(binding, knowledgeRoot))
                .toList();
    }

    private ProjectDependency resolveDependency(ProjectDependencyBinding binding, Path knowledgeRoot) {
        try {
            Path source = Path.of(binding.projectPath()).toAbsolutePath().normalize();
            String normalizedPath = source.toString();
            String projectKey = normalizedProjectKey(binding.projectKey(), normalizedPath);
            return new ProjectDependency(
                    normalizedPath,
                    projectKey,
                    normalizedRelation(binding.relation()),
                    Files.isDirectory(source),
                    Files.isDirectory(knowledgeRoot.resolve(projectKey)));
        } catch (InvalidPathException exception) {
            return new ProjectDependency(binding.projectPath(), binding.projectKey(),
                    normalizedRelation(binding.relation()), false, false);
        }
    }

    private static String normalizedProjectKey(String requestedKey, String projectPath) {
        if (requestedKey != null && !requestedKey.isBlank()) {
            return requestedKey.trim();
        }
        Path path = Path.of(projectPath);
        return path.getFileName() == null ? path.toString() : path.getFileName().toString();
    }

    private static String normalizedRelation(String relation) {
        String value = relation == null || relation.isBlank()
                ? ProjectEvidenceRelation.DEPENDS_ON.name() : relation.trim().toUpperCase(Locale.ROOT);
        ProjectEvidenceRelation parsed;
        try {
            parsed = ProjectEvidenceRelation.valueOf(value);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("不支持的项目关系: " + relation, error);
        }
        if (parsed == ProjectEvidenceRelation.PRIMARY) {
            throw new IllegalArgumentException("依赖项目关系不能为 PRIMARY");
        }
        return parsed.name();
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
