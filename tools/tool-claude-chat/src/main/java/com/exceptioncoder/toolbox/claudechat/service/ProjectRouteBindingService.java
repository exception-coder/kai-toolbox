package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceDirView;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceListResponse;
import com.exceptioncoder.toolbox.claudechat.config.BusinessWorkspaceProperties;
import com.exceptioncoder.toolbox.claudechat.domain.ProjectRouteBinding;
import com.exceptioncoder.toolbox.claudechat.domain.ResolvedProjectRouteBinding;
import com.exceptioncoder.toolbox.claudechat.repository.ProjectRouteBindingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/** 合并并管理 projectKey 与本机受控源码根的稳定路由绑定。 */
@Service
public class ProjectRouteBindingService {

    private static final int MAX_ALIAS_COUNT = 12;
    private static final int MAX_ALIAS_LENGTH = 100;
    private static final boolean CASE_INSENSITIVE_PATH = File.separatorChar == '\\';
    private static final Pattern PROJECT_KEY = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,119}");

    private final ProjectRouteBindingRepository repository;
    private final WorkspaceScanService workspaceScanService;
    private final ProjectAliasService projectAliasService;
    private final BusinessWorkspaceCatalog businessWorkspaceCatalog;
    private final BusinessWorkspaceProperties businessWorkspaceProperties;
    private final TeamToolsPathService teamToolsPathService;

    public ProjectRouteBindingService(
            ProjectRouteBindingRepository repository,
            WorkspaceScanService workspaceScanService,
            ProjectAliasService projectAliasService,
            BusinessWorkspaceCatalog businessWorkspaceCatalog,
            BusinessWorkspaceProperties businessWorkspaceProperties,
            TeamToolsPathService teamToolsPathService
    ) {
        this.repository = repository;
        this.workspaceScanService = workspaceScanService;
        this.projectAliasService = projectAliasService;
        this.businessWorkspaceCatalog = businessWorkspaceCatalog;
        this.businessWorkspaceProperties = businessWorkspaceProperties;
        this.teamToolsPathService = teamToolsPathService;
    }

    /** 返回显式、托管、目录同名和未绑定知识项目的合并视图。 */
    public List<ResolvedProjectRouteBinding> list() {
        Map<String, ResolvedProjectRouteBinding> byProjectKey = new LinkedHashMap<>();
        Set<String> claimedPaths = new LinkedHashSet<>();

        for (ProjectRouteBinding explicit : repository.findAll()) {
            ResolvedProjectRouteBinding resolved = resolved(
                    explicit.projectKey(), explicit.projectPath(), displayName(explicit.projectKey(), explicit.aliases()),
                    explicit.aliases(), "EXPLICIT", true, "Forge SQLite 显式绑定");
            byProjectKey.put(key(explicit.projectKey()), resolved);
            claimedPaths.add(pathKey(explicit.projectPath()));
        }

        Path businessRoot = businessWorkspaceProperties.resolveRoot();
        for (BusinessWorkspaceCatalog.SystemDefinition system : businessWorkspaceCatalog.systems()) {
            String projectKey = system.workspaceName();
            if (byProjectKey.containsKey(key(projectKey))) {
                continue;
            }
            String projectPath = businessRoot.resolve(system.workspaceName()).normalize().toString();
            List<String> aliases = List.of(system.id(), system.name());
            byProjectKey.put(key(projectKey), resolved(
                    projectKey, projectPath, system.name(), aliases,
                    "MANAGED_CATALOG", false, "Forge 托管业务源码目录"));
            claimedPaths.add(pathKey(projectPath));
        }

        WorkspaceListResponse workspaces = projectAliasService.decorate(workspaceScanService.scan());
        workspaces.roots().stream()
                .filter(WorkspaceListResponse.RootView::exists)
                .flatMap(root -> root.dirs().stream())
                .forEach(directory -> addDirectoryConvention(byProjectKey, claimedPaths, directory));

        for (String projectKey : teamToolsPathService.knowledgeProjectKeys()) {
            byProjectKey.putIfAbsent(key(projectKey), new ResolvedProjectRouteBinding(
                    projectKey, "", projectKey, List.of(), "UNBOUND", false,
                    false, true, "团队知识已存在，但尚未绑定本机源码目录"));
        }

        return byProjectKey.values().stream()
                .sorted((left, right) -> left.projectKey().compareToIgnoreCase(right.projectKey()))
                .toList();
    }

    /** 按 projectKey、名称、别名或受控路径解析唯一绑定。 */
    public ResolvedProjectRouteBinding resolve(String project) {
        if (project == null || project.isBlank()) {
            throw new IllegalArgumentException("项目不能为空");
        }
        String requested = project.trim();
        String requestedPath = normalizedPathOrEmpty(requested);
        List<ResolvedProjectRouteBinding> matched = list().stream()
                .filter(binding -> matches(binding, requested, requestedPath))
                .toList();
        if (matched.isEmpty()) {
            throw new IllegalArgumentException("项目未绑定到 Forge 受控源码: " + project);
        }
        if (matched.size() > 1) {
            throw new IllegalArgumentException("项目名称或别名存在多个路由候选: " + project);
        }
        ResolvedProjectRouteBinding binding = matched.get(0);
        if (binding.projectPath().isBlank()) {
            throw new IllegalArgumentException("项目知识已登记，但未绑定本机源码: " + binding.projectKey());
        }
        return binding;
    }

    /** 保存或覆盖一个显式本机绑定。 */
    @Transactional
    public ResolvedProjectRouteBinding save(String requestedProjectKey, String projectPath, List<String> aliases) {
        String projectKey = normalizeProjectKey(requestedProjectKey);
        String normalizedPath = requireWorkspaceProject(projectPath);
        List<String> normalizedAliases = normalizeAliases(aliases);
        validateUniquePath(projectKey, normalizedPath);
        validateUniqueAliases(projectKey, normalizedAliases);

        long now = System.currentTimeMillis();
        ProjectRouteBinding existing = repository.findByProjectKey(projectKey).orElse(null);
        repository.upsert(new ProjectRouteBinding(
                existing == null ? UUID.randomUUID().toString() : existing.id(),
                projectKey,
                normalizedPath,
                normalizedAliases,
                existing == null ? now : existing.createTime(),
                now));
        return resolve(projectKey);
    }

    /** 删除显式绑定，使路由恢复托管或目录同名回退。 */
    @Transactional
    public void delete(String requestedProjectKey) {
        repository.delete(normalizeProjectKey(requestedProjectKey));
    }

    private void addDirectoryConvention(
            Map<String, ResolvedProjectRouteBinding> byProjectKey,
            Set<String> claimedPaths,
            WorkspaceDirView directory
    ) {
        String normalizedPathKey = pathKey(directory.path());
        if (claimedPaths.contains(normalizedPathKey)) {
            return;
        }
        String projectKey = directory.name();
        if (byProjectKey.containsKey(key(projectKey))) {
            return;
        }
        List<String> aliases = directory.alias() == null || directory.alias().isBlank()
                ? List.of()
                : List.of(directory.alias());
        byProjectKey.put(key(projectKey), resolved(
                projectKey, directory.path(), directory.displayName(), aliases,
                "DIRECTORY_CONVENTION", false, "兼容规则：源码目录名等于 knowledge projectKey"));
        claimedPaths.add(normalizedPathKey);
    }

    private ResolvedProjectRouteBinding resolved(
            String projectKey,
            String projectPath,
            String displayName,
            List<String> aliases,
            String source,
            boolean explicit,
            String message
    ) {
        return new ResolvedProjectRouteBinding(
                projectKey,
                projectPath,
                displayName,
                aliases,
                source,
                explicit,
                Files.isDirectory(Path.of(projectPath)),
                Files.isDirectory(teamToolsPathService.knowledgeProject(projectKey)),
                message);
    }

    private boolean matches(ResolvedProjectRouteBinding binding, String requested, String requestedPath) {
        if (binding.projectKey().equalsIgnoreCase(requested)
                || binding.displayName().equalsIgnoreCase(requested)
                || binding.aliases().stream().anyMatch(alias -> alias.equalsIgnoreCase(requested))) {
            return true;
        }
        return !requestedPath.isBlank()
                && !binding.projectPath().isBlank()
                && pathKey(binding.projectPath()).equals(pathKey(requestedPath));
    }

    private void validateUniquePath(String projectKey, String projectPath) {
        repository.findAll().stream()
                .filter(binding -> !binding.projectKey().equalsIgnoreCase(projectKey))
                .filter(binding -> pathKey(binding.projectPath()).equals(pathKey(projectPath)))
                .findFirst()
                .ifPresent(binding -> {
                    throw new IllegalArgumentException(
                            "源码目录已显式绑定到 projectKey: " + binding.projectKey());
                });
    }

    private void validateUniqueAliases(String projectKey, List<String> aliases) {
        if (aliases.isEmpty()) {
            return;
        }
        list().stream()
                .filter(binding -> !binding.projectKey().equalsIgnoreCase(projectKey))
                .filter(binding -> binding.aliases().stream()
                        .anyMatch(existing -> aliases.stream().anyMatch(existing::equalsIgnoreCase)))
                .findFirst()
                .ifPresent(binding -> {
                    throw new IllegalArgumentException("项目别名已被占用: " + binding.projectKey());
                });
    }

    private String requireWorkspaceProject(String projectPath) {
        String normalized = normalizePath(projectPath);
        return workspaceScanService.scan().roots().stream()
                .filter(WorkspaceListResponse.RootView::exists)
                .flatMap(root -> root.dirs().stream())
                .map(WorkspaceDirView::path)
                .filter(path -> pathKey(path).equals(pathKey(normalized)))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("源码路径不是 Forge 工作区一级项目: " + projectPath));
    }

    private static String normalizeProjectKey(String value) {
        String projectKey = value == null ? "" : value.trim();
        if (!PROJECT_KEY.matcher(projectKey).matches() || projectKey.equals(".") || projectKey.equals("..")) {
            throw new IllegalArgumentException("projectKey 格式无效");
        }
        return projectKey;
    }

    private static List<String> normalizeAliases(List<String> aliases) {
        Set<String> normalized = new LinkedHashSet<>();
        if (aliases != null) {
            for (String alias : aliases) {
                if (alias == null || alias.isBlank()) {
                    continue;
                }
                String value = alias.trim();
                if (value.length() > MAX_ALIAS_LENGTH) {
                    throw new IllegalArgumentException("项目别名不能超过 " + MAX_ALIAS_LENGTH + " 个字符");
                }
                normalized.add(value);
            }
        }
        if (normalized.size() > MAX_ALIAS_COUNT) {
            throw new IllegalArgumentException("每个项目最多配置 " + MAX_ALIAS_COUNT + " 个别名");
        }
        return List.copyOf(normalized);
    }

    private static String displayName(String projectKey, List<String> aliases) {
        return aliases.isEmpty() ? projectKey : aliases.get(0);
    }

    private static String key(String value) {
        return value.toLowerCase(Locale.ROOT);
    }

    private static String normalizePath(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("项目路径不能为空");
        }
        try {
            return Path.of(value).toAbsolutePath().normalize().toString();
        } catch (InvalidPathException exception) {
            throw new IllegalArgumentException("项目路径格式无效", exception);
        }
    }

    private static String normalizedPathOrEmpty(String value) {
        try {
            return Path.of(value).toAbsolutePath().normalize().toString();
        } catch (RuntimeException exception) {
            return "";
        }
    }

    private static String pathKey(String value) {
        String normalized = normalizePath(value);
        return CASE_INSENSITIVE_PATH ? normalized.toLowerCase(Locale.ROOT) : normalized;
    }
}
