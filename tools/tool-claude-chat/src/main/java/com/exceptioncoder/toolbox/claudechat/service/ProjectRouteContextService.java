package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ProjectModulesResponse;
import com.exceptioncoder.toolbox.claudechat.api.dto.ProjectModulesResponse.ModuleView;
import com.exceptioncoder.toolbox.claudechat.domain.ResolvedProjectRouteBinding;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScope;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceScopeResolver;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceSourceType;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectRouteContext;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectRouteContextResolver;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectRouteModule;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectRouteRequest;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** 解析项目名称、模块名称与 URL，生成所有咨询共享的受控项目证据上下文。 */
@Service
public class ProjectRouteContextService implements ProjectRouteContextResolver {

    private static final int MAX_ROUTE_MATCHES = 12;

    private final ProjectRouteBindingService bindingService;
    private final WorkspaceScanService workspaceScanService;
    private final ProjectEvidenceScopeResolver evidenceScopeResolver;
    private final TeamToolsPathService teamToolsPathService;

    public ProjectRouteContextService(
            ProjectRouteBindingService bindingService,
            WorkspaceScanService workspaceScanService,
            ProjectEvidenceScopeResolver evidenceScopeResolver,
            TeamToolsPathService teamToolsPathService
    ) {
        this.bindingService = bindingService;
        this.workspaceScanService = workspaceScanService;
        this.evidenceScopeResolver = evidenceScopeResolver;
        this.teamToolsPathService = teamToolsPathService;
    }

    /** 将项目、模块和 URL 输入收敛为受控代码与知识范围。 */
    @Override
    public ProjectRouteContext resolve(ProjectRouteRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("项目路由请求不能为空");
        }
        ResolvedProjectRouteBinding binding = bindingService.resolve(request.project());
        ProjectModulesResponse scanned = workspaceScanService.scanModules(binding.projectPath());
        List<ProjectRouteModule> modules = flattenModules(scanned.modules());
        List<ProjectRouteModule> matchedModules = matchModules(modules, request.module());
        List<String> urlMatches = matchRouteMap(binding.projectKey(), request.url());
        ProjectEvidenceScope evidenceScope = evidenceScopeResolver.resolve(binding.projectKey());
        List<String> diagnostics = diagnostics(
                binding, request, modules, matchedModules, urlMatches, evidenceScope);

        return new ProjectRouteContext(
                normalize(request.project()),
                binding.projectKey(),
                binding.projectPath(),
                binding.displayName(),
                binding.aliases(),
                binding.source(),
                normalize(request.module()),
                normalize(request.url()),
                modules,
                matchedModules,
                urlMatches,
                evidenceScope,
                diagnostics);
    }

    private List<ProjectRouteModule> flattenModules(List<ModuleView> roots) {
        List<ProjectRouteModule> modules = new ArrayList<>();
        collectModules(roots, modules);
        return List.copyOf(modules);
    }

    private void collectModules(List<ModuleView> roots, List<ProjectRouteModule> modules) {
        if (roots == null) {
            return;
        }
        for (ModuleView module : roots) {
            String codePath = module.codePath() == null || module.codePath().isBlank()
                    ? module.absPath()
                    : module.codePath();
            List<String> webPaths = module.webPaths() == null ? List.of() : module.webPaths();
            modules.add(new ProjectRouteModule(
                    normalize(module.key()),
                    normalize(module.name()),
                    normalize(codePath),
                    webPaths,
                    normalize(module.summary()),
                    "knowledge".equals(module.type()) ? "DOMAIN_KNOWLEDGE" : "BUILD_SCAN"));
            collectModules(module.children(), modules);
        }
    }

    private List<ProjectRouteModule> matchModules(List<ProjectRouteModule> modules, String requestedModule) {
        String requested = normalize(requestedModule);
        if (requested.isBlank()) {
            return modules;
        }
        Set<String> tokens = moduleTokens(requested);
        List<ProjectRouteModule> exact = modules.stream()
                .filter(module -> tokens.stream().anyMatch(token -> exactModuleMatch(module, token)))
                .toList();
        if (!exact.isEmpty()) {
            return exact;
        }
        return modules.stream()
                .filter(module -> tokens.stream().anyMatch(token -> containsModuleMatch(module, token)))
                .toList();
    }

    private Set<String> moduleTokens(String requested) {
        Set<String> tokens = new LinkedHashSet<>();
        for (String value : requested.split("[,，;；/|]+")) {
            String token = value.trim().toLowerCase(Locale.ROOT);
            if (!token.isBlank()) {
                tokens.add(token);
            }
        }
        return tokens.isEmpty() ? Set.of(requested.toLowerCase(Locale.ROOT)) : Set.copyOf(tokens);
    }

    private boolean exactModuleMatch(ProjectRouteModule module, String token) {
        return module.key().equalsIgnoreCase(token) || module.name().equalsIgnoreCase(token);
    }

    private boolean containsModuleMatch(ProjectRouteModule module, String token) {
        return module.key().toLowerCase(Locale.ROOT).contains(token)
                || module.name().toLowerCase(Locale.ROOT).contains(token)
                || module.summary().toLowerCase(Locale.ROOT).contains(token);
    }

    private List<String> matchRouteMap(String projectKey, String requestedUrl) {
        String url = normalizedUrl(requestedUrl);
        if (url.isBlank()) {
            return List.of();
        }
        Path routeMap = teamToolsPathService.routeMap(projectKey);
        if (!Files.isRegularFile(routeMap)) {
            return List.of();
        }
        try {
            List<String> lines = Files.readAllLines(routeMap, StandardCharsets.UTF_8);
            List<String> matches = new ArrayList<>();
            for (int index = 0; index < lines.size() && matches.size() < MAX_ROUTE_MATCHES; index++) {
                String line = lines.get(index).trim();
                if (!line.isBlank() && line.toLowerCase(Locale.ROOT).contains(url.toLowerCase(Locale.ROOT))) {
                    matches.add("L" + (index + 1) + ": " + line);
                }
            }
            return List.copyOf(matches);
        } catch (Exception exception) {
            return List.of();
        }
    }

    private List<String> diagnostics(
            ResolvedProjectRouteBinding binding,
            ProjectRouteRequest request,
            List<ProjectRouteModule> modules,
            List<ProjectRouteModule> matchedModules,
            List<String> urlMatches,
            ProjectEvidenceScope evidenceScope
    ) {
        List<String> diagnostics = new ArrayList<>();
        if ("DIRECTORY_CONVENTION".equals(binding.source())) {
            diagnostics.add("当前依赖目录名等于 projectKey 的兼容规则，建议保存显式绑定");
        }
        if (!binding.knowledgeAvailable()) {
            diagnostics.add("project-domain-knowledge 中没有该 projectKey 的知识目录");
        }
        if (modules.isEmpty()) {
            diagnostics.add("未从 modules.json 或构建文件识别到模块");
        } else if (!normalize(request.module()).isBlank() && matchedModules.isEmpty()) {
            diagnostics.add("模块名称未命中 modules.json 或构建扫描结果");
        }
        if (!normalize(request.url()).isBlank()) {
            boolean routeMapAvailable = Boolean.TRUE.equals(
                    evidenceScope.primary().availability().get(ProjectEvidenceSourceType.ROUTE_MAP));
            if (!routeMapAvailable) {
                diagnostics.add("该项目没有 URL Route Map，将由模块范围与 Graphify 继续收敛");
            } else if (urlMatches.isEmpty()) {
                diagnostics.add("URL Route Map 存在，但当前 URL 未直接命中");
            }
        }
        if (!Boolean.TRUE.equals(
                evidenceScope.primary().availability().get(ProjectEvidenceSourceType.GRAPHIFY))) {
            diagnostics.add("项目源码根尚无可用 Graphify 图谱");
        }
        return List.copyOf(diagnostics);
    }

    private static String normalizedUrl(String value) {
        String raw = normalize(value);
        if (raw.isBlank()) {
            return "";
        }
        try {
            URI uri = URI.create(raw);
            String path = uri.getPath();
            return path == null || path.isBlank() ? raw : path;
        } catch (IllegalArgumentException exception) {
            int query = raw.indexOf('?');
            int fragment = raw.indexOf('#');
            int end = query < 0 ? raw.length() : query;
            if (fragment >= 0) {
                end = Math.min(end, fragment);
            }
            return raw.substring(0, end);
        }
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
