package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.SystemRouteInspectionView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SystemRouteInspectionView.MenuToolView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SystemRouteInspectionView.RouteCheckView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SystemRouteInspectionView.RuntimeToolsView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SystemRouteInspectionView.RuntimeToolView;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectEvidenceSourceType;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectRouteContext;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectRouteContextResolver;
import com.exceptioncoder.toolbox.common.projectevidence.ProjectRouteRequest;
import com.exceptioncoder.toolbox.common.tool.ToolDescriptor;
import com.exceptioncoder.toolbox.common.tool.ToolRegistry;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** 将平台项目路由上下文转换为可观察、可恢复的完整性检查。 */
@Service
public class SystemRouteInspectionService {

    private static final Set<String> DATABASE_ROUTED_PROJECTS = Set.of(
            "erp", "erp-system", "yoooni", "srm", "srm-system", "scm", "scm-system");

    private final ProjectRouteContextResolver routeContextResolver;
    private final SidecarRouteInspectionService sidecarRouteInspectionService;
    private final ToolRegistry toolRegistry;

    public SystemRouteInspectionService(
            ProjectRouteContextResolver routeContextResolver,
            SidecarRouteInspectionService sidecarRouteInspectionService,
            ToolRegistry toolRegistry
    ) {
        this.routeContextResolver = routeContextResolver;
        this.sidecarRouteInspectionService = sidecarRouteInspectionService;
        this.toolRegistry = toolRegistry;
    }

    /** 执行项目、模块、URL、知识、拓扑与 Tool 的只读检查。 */
    public SystemRouteInspectionView inspect(String project, String module, String url) {
        ProjectRouteContext route;
        try {
            route = routeContextResolver.resolve(new ProjectRouteRequest(project, module, url));
        } catch (IllegalArgumentException exception) {
            RouteCheckView failed = check(
                    "PROJECT_BOUND", "FAIL", "项目没有形成可用绑定", exception.getMessage(),
                    "在系统路由检测页把 knowledge projectKey 绑定到工作区源码目录。", normalize(project));
            return new SystemRouteInspectionView(
                    "BROKEN", "项目路由未建立，无法进入源码与知识探索。", null,
                    unavailableRuntime(), List.of(), List.of(failed));
        }

        SidecarRouteInspectionService.Result runtime = sidecarRouteInspectionService.inspect(route.projectPath());
        List<RouteCheckView> checks = checks(route, runtime);
        String overallStatus = overallStatus(checks);
        return new SystemRouteInspectionView(
                overallStatus,
                summary(overallStatus, checks),
                route,
                runtimeView(runtime),
                relatedMenuTools(route, runtime),
                checks);
    }

    private List<RouteCheckView> checks(
            ProjectRouteContext route,
            SidecarRouteInspectionService.Result runtime
    ) {
        List<RouteCheckView> checks = new ArrayList<>();
        boolean convention = "DIRECTORY_CONVENTION".equals(route.bindingSource());
        checks.add(check(
                "PROJECT_BOUND", convention ? "WARNING" : "PASS",
                convention ? "项目仍依赖目录同名兼容规则" : "项目绑定已确定",
                "projectKey=" + route.projectKey() + "，binding=" + route.bindingSource(),
                convention ? "保存显式绑定，避免目录改名后路由失效。" : "",
                route.projectPath()));

        boolean source = route.evidenceScope().primary().availability()
                .getOrDefault(ProjectEvidenceSourceType.SOURCE, false);
        checks.add(check(
                "SOURCE_AVAILABLE", source ? "PASS" : "FAIL",
                source ? "源码目录可访问" : "源码目录不可访问",
                source ? "Forge 已验证受控源码根存在。" : "绑定路径不存在或尚未同步。",
                source ? "" : "同步源码或重新选择工作区目录。", route.projectPath()));

        boolean moduleRequested = !route.requestedModule().isBlank();
        boolean moduleAvailable = moduleRequested ? !route.matchedModules().isEmpty() : !route.modules().isEmpty();
        checks.add(check(
                "MODULES_RESOLVED", moduleAvailable ? "PASS" : moduleRequested ? "FAIL" : "WARNING",
                moduleAvailable ? "模块代码范围已解析" : moduleRequested ? "模块名称未命中" : "项目没有可用模块清单",
                moduleAvailable
                        ? "已识别 " + route.matchedModules().size() + " 个当前查询模块，项目共 "
                        + route.modules().size() + " 个模块。"
                        : "检查 modules.json 的 key/name/codePath，或确认项目构建目录。",
                moduleAvailable ? "" : "在项目工作台同步 modules.json 后重试。",
                "project-domain-knowledge/knowledge/" + route.projectKey() + "/impl/modules.json"));

        boolean knowledge = route.evidenceScope().primary().availability()
                .getOrDefault(ProjectEvidenceSourceType.DOMAIN_KNOWLEDGE, false);
        checks.add(check(
                "DOMAIN_KNOWLEDGE_AVAILABLE", knowledge ? "PASS" : "FAIL",
                knowledge ? "业务知识已关联" : "业务知识未关联",
                knowledge ? "project-domain-knowledge 已存在对应 projectKey。" : "咨询缺少系统业务真理来源。",
                knowledge ? "" : "初始化或绑定正确的 project-domain-knowledge projectKey。",
                "project-domain-knowledge/knowledge/" + route.projectKey()));

        boolean topology = route.evidenceScope().primary().availability()
                .getOrDefault(ProjectEvidenceSourceType.CROSS_PROJECT_TOPOLOGY, false);
        checks.add(check(
                "CROSS_TOPOLOGY_AVAILABLE", topology ? "PASS" : "WARNING",
                topology ? "跨项目拓扑已关联" : "跨项目拓扑未登记",
                topology ? "cross-project-topology 存在当前 projectKey。" : "跨系统调用需要依赖显式关联项目补足。",
                topology ? "" : "在 cross-project-topology 登记系统关系，或在项目工作台确认关联项目。",
                "cross-project-topology/knowledge/" + route.projectKey()));

        boolean graphify = route.evidenceScope().primary().availability()
                .getOrDefault(ProjectEvidenceSourceType.GRAPHIFY, false);
        checks.add(check(
                "GRAPHIFY_AVAILABLE", graphify ? "PASS" : "WARNING",
                graphify ? "Graphify 代码图谱可用" : "Graphify 代码图谱不可用",
                graphify ? "可在已绑定源码根内查询调用链和实现关系。" : "代码探索将缺少结构化调用链收敛。",
                graphify ? "" : "在绑定源码根运行 /graphify 后重试。",
                route.projectPath() + "/graphify-out/graph.json"));

        addUrlCheck(route, checks);
        checks.add(runtimeCheck(route, runtime));
        return List.copyOf(checks);
    }

    private void addUrlCheck(ProjectRouteContext route, List<RouteCheckView> checks) {
        if (route.requestedUrl().isBlank()) {
            return;
        }
        boolean routeMap = route.evidenceScope().primary().availability()
                .getOrDefault(ProjectEvidenceSourceType.ROUTE_MAP, false);
        boolean matched = !route.urlRouteMatches().isEmpty();
        checks.add(check(
                "URL_ROUTE_RESOLVED", matched ? "PASS" : "WARNING",
                matched ? "URL 已直达路由坐标" : routeMap ? "URL 未命中 Route Map" : "项目未配置 URL Route Map",
                matched ? "URL Route Map 已返回确定性代码坐标。" : "将使用模块范围与 Graphify 继续探索，不阻断咨询。",
                matched ? "" : routeMap ? "补充或修正 URL Route Map。" : "高频 URL 项目可补充 url-route-map.md。",
                "project-coding-profiles/profiles/" + route.projectKey() + "/url-route-map.md"));
    }

    private RouteCheckView runtimeCheck(
            ProjectRouteContext route,
            SidecarRouteInspectionService.Result runtime
    ) {
        if (!"VERIFIED".equals(runtime.status())) {
            return check(
                    "RUNTIME_TOOLS_VERIFIED", "UNVERIFIED", "运行时 Tool 尚未核验",
                    "Sidecar 当前不可达或版本不支持路由诊断。",
                    "启动或更新 Sidecar 后重新检测。", route.projectPath());
        }
        boolean databaseRouted = DATABASE_ROUTED_PROJECTS.contains(route.projectKey().toLowerCase(Locale.ROOT));
        boolean targetAvailable = !runtime.targetSystems().isEmpty();
        return check(
                "RUNTIME_TOOLS_VERIFIED", databaseRouted && !targetAvailable ? "FAIL" : "PASS",
                databaseRouted && !targetAvailable ? "业务系统没有命中运行时数据库 Tool" : "运行时 Tool 路由已核验",
                targetAvailable
                        ? "实际目标系统: " + String.join(", ", runtime.targetSystems())
                        : "该项目没有专用 ERP/SRM/SCM 数据库 Tool，仍可使用源码与知识工具。",
                databaseRouted && !targetAvailable ? "检查 Sidecar 系统目录路由或项目绑定。" : "",
                "sidecar/claude-agent/src/codexSecurity.ts");
    }

    private List<MenuToolView> relatedMenuTools(
            ProjectRouteContext route,
            SidecarRouteInspectionService.Result runtime
    ) {
        Set<String> tokens = new LinkedHashSet<>();
        tokens.add(route.projectKey().toLowerCase(Locale.ROOT));
        route.aliases().stream().map(value -> value.toLowerCase(Locale.ROOT)).forEach(tokens::add);
        runtime.targetSystems().stream().map(value -> value.toLowerCase(Locale.ROOT)).forEach(tokens::add);
        return toolRegistry.all().stream()
                .filter(tool -> tokens.stream().anyMatch(token -> toolMatches(tool, token)))
                .map(tool -> new MenuToolView(tool.id(), tool.name(), tool.route(), tool.description()))
                .toList();
    }

    private boolean toolMatches(ToolDescriptor tool, String token) {
        if (token.length() < 2) {
            return false;
        }
        String text = String.join(" ",
                normalize(tool.id()), normalize(tool.name()), normalize(tool.route()), normalize(tool.description()))
                .toLowerCase(Locale.ROOT);
        return text.contains(token);
    }

    private RuntimeToolsView runtimeView(SidecarRouteInspectionService.Result result) {
        return new RuntimeToolsView(
                result.status(),
                result.targetSystems(),
                result.tools().stream().map(tool -> new RuntimeToolView(tool.server(), tool.tool())).toList(),
                result.protocolVersion());
    }

    private RuntimeToolsView unavailableRuntime() {
        return new RuntimeToolsView("UNAVAILABLE", List.of(), List.of(), null);
    }

    private String overallStatus(List<RouteCheckView> checks) {
        if (checks.stream().anyMatch(check -> "FAIL".equals(check.status()))) {
            return "BROKEN";
        }
        if (checks.stream().anyMatch(check -> "WARNING".equals(check.status()))) {
            return "DEGRADED";
        }
        if (checks.stream().anyMatch(check -> "UNVERIFIED".equals(check.status()))) {
            return "UNVERIFIED";
        }
        return "HEALTHY";
    }

    private String summary(String status, List<RouteCheckView> checks) {
        long passed = checks.stream().filter(check -> "PASS".equals(check.status())).count();
        long total = checks.size();
        return switch (status) {
            case "HEALTHY" -> "项目、模块、知识、代码图谱与运行时 Tool 已全部打通（" + passed + "/" + total + "）。";
            case "BROKEN" -> "存在阻断咨询路由的缺口，请先处理失败项（" + passed + "/" + total + " 已通过）。";
            case "UNVERIFIED" -> "静态路由已打通，但运行时 Tool 尚未完成核验。";
            default -> "主路由可用，但仍有可改进的知识或定位缺口（" + passed + "/" + total + " 已通过）。";
        };
    }

    private RouteCheckView check(
            String code,
            String status,
            String title,
            String explanation,
            String recoveryAction,
            String evidence
    ) {
        return new RouteCheckView(code, status, title, explanation, recoveryAction, evidence);
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
