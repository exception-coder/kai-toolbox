package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.project.ProjectAccess;
import com.exceptioncoder.toolbox.common.project.ProjectCatalog;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSourceRouting;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSystemPref;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultOrchestrationResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** 从项目目录投影有界候选；模型作语义选择，代码核对身份、范围与文件证据。 */
@Service
public class ConsultSourceRoutingService {
    private final ProjectCatalog catalog;
    private final ProjectAccess access;
    private final SystemPrefService prefs;
    private final ConsultSessionRepository sessions;
    private final ConsultEvidenceRouteService routes;
    private final ObjectMapper mapper;

    public ConsultSourceRoutingService(ProjectCatalog catalog, ProjectAccess access, SystemPrefService prefs,
                                       ConsultSessionRepository sessions, ConsultEvidenceRouteService routes,
                                       ObjectMapper mapper) {
        this.catalog = catalog; this.access = access; this.prefs = prefs;
        this.sessions = sessions; this.routes = routes; this.mapper = mapper;
    }

    public record Prepared(StartSessionRequest request, ConsultSourceRouting scope) { }

    public Prepared prepare(StartSessionRequest request) {
        if (!Boolean.TRUE.equals(request.autoDetect())) {
            if (request.systemName() == null || request.systemName().isBlank()
                    || request.systemSourcePath() == null || request.systemSourcePath().isBlank()) {
                throw new IllegalArgumentException("指定系统模式需要有效系统；也可使用自动识别");
            }
            var entry = catalog.list(false).stream().filter(value -> value.available() && !value.excluded()
                            && key(value.path()).equals(key(request.systemSourcePath()))
                            && access.allowed(Path.of(value.path()))).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("指定系统不在项目库可用目录中，请恢复目录或使用自动识别"));
            return new Prepared(new StartSessionRequest(entry.name(), entry.path(),
                    request.moduleNames() == null ? List.of() : request.moduleNames(), request.questionTitle(),
                    request.question(), request.userId(), request.role(), request.engine(), request.model(),
                    request.codexReasoningEffort(), request.codexSpeed(), request.codexHome(), request.orchestrationVersion(), false), null);
        }
        var projects = candidates(request.systemSourcePath());
        if (projects.isEmpty()) {
            throw new IllegalArgumentException("暂无可探索系统，请在咨询配置中显示系统，并在项目库恢复可用源码目录");
        }
        var anchor = projects.getFirst();
        boolean preferredRetained = request.systemSourcePath() != null && !request.systemSourcePath().isBlank()
                && key(anchor.path()).equals(key(request.systemSourcePath()));
        var modules = !preferredRetained || request.moduleNames() == null ? List.<String>of() : request.moduleNames();
        var normalized = new StartSessionRequest(anchor.name(), anchor.path(), modules, request.questionTitle(),
                request.question(), request.userId(), request.role(), request.engine(), request.model(),
                request.codexReasoningEffort(), request.codexSpeed(), request.codexHome(), request.orchestrationVersion(), true);
        return new Prepared(normalized, new ConsultSourceRouting(true, null, projects, null, null, null));
    }

    public List<ConsultSourceRouting.Project> candidates() {
        return candidates(null);
    }

    private List<ConsultSourceRouting.Project> candidates(String preferredPath) {
        var preferences = prefs.listAll();
        var available = catalog.list(false);
        Map<String, ConsultSystemPref> visible = new java.util.HashMap<>();
        for (var entry : available) {
            if (!entry.available() || entry.excluded() || !access.allowed(Path.of(entry.path()))) {
                continue;
            }
            var preference = preferenceFor(entry, preferences, available);
            if (preference != null) {
                visible.put(entry.id(), preference);
            }
        }
        var eligible = available.stream().filter(entry -> entry.available() && !entry.excluded())
                .filter(entry -> visible.containsKey(entry.id()))
                .sorted(Comparator.<ProjectCatalog.Entry>comparingInt(entry -> visible.get(entry.id()).getSortOrder())
                        .thenComparing(ProjectCatalog.Entry::name).thenComparing(ProjectCatalog.Entry::id))
                .toList();
        boolean preferred = preferredPath != null && !preferredPath.isBlank();
        return eligible.stream().sorted(Comparator.comparingInt(entry ->
                        preferred && key(entry.path()).equals(key(preferredPath)) ? 0 : 1))
                .limit(8).map(entry -> new ConsultSourceRouting.Project(entry.id(), entry.name(),
                        visible.get(entry.id()).getAlias() == null ? entry.name() : visible.get(entry.id()).getAlias(),
                        entry.path())).toList();
    }

    /** 配置归属按源码路径，名称只用于兼容未保存路径的旧记录，不使用展示别名推断身份。 */
    private ConsultSystemPref preferenceFor(ProjectCatalog.Entry entry, List<ConsultSystemPref> preferences,
                                            List<ProjectCatalog.Entry> available) {
        var matches = preferences.stream().filter(pref -> pref.getSystemSourcePath() != null
                && !pref.getSystemSourcePath().isBlank()
                && key(pref.getSystemSourcePath()).equals(key(entry.path()))).toList();
        if (matches.isEmpty()) {
            String directoryName = Path.of(entry.path()).getFileName().toString();
            matches = preferences.stream().filter(pref -> pref.getSystemSourcePath() == null
                    || pref.getSystemSourcePath().isBlank())
                    .filter(pref -> directoryName.equals(pref.getSystemName())).toList();
            if (!matches.isEmpty() && available.stream().filter(value -> directoryName.equals(
                    Path.of(value.path()).getFileName().toString())).count() != 1) {
                return null;
            }
        }
        return matches.size() == 1 && matches.getFirst().isVisible() ? matches.getFirst() : null;
    }

    public ConsultInitialDispatch decorate(ConsultInitialDispatch dispatch, ConsultSourceRouting scope) {
        if (scope == null) { return dispatch; }
        var result = dispatch.orchestration();
        var sourceRoute = new ConsultEvidenceRouteResolution(List.of(), scope.wrap("[]"), instructions(scope), List.of());
        return new ConsultInitialDispatch(new ConsultOrchestrationResult(result.pipelineVersion(),
                result.prompt() + "\n" + instructions(scope), result.steps(), result.capabilityGaps(),
                result.workflowSnapshot()), sourceRoute);
    }

    public ConsultSourceRouting current(ConsultSession session) {
        var scope = ConsultSourceRouting.read(session.getEvidenceRouteSnapshot());
        if (scope == null) { return null; }
        var available = catalog.list(false);
        var preferences = prefs.listAll();
        var projects = scope.projects().stream().filter(project -> available.stream().anyMatch(entry ->
                        entry.available() && !entry.excluded() && entry.id().equals(project.id())
                                && preferenceFor(entry, preferences, available) != null
                                && key(entry.path()).equals(key(project.path()))))
                .filter(project -> access.allowed(Path.of(project.path()))).toList();
        String focus = projects.stream().anyMatch(project -> Objects.equals(project.id(), scope.focusedProject()))
                ? scope.focusedProject() : null;
        return new ConsultSourceRouting(scope.automatic(), focus, projects, scope.evidencePath(), scope.reason(), scope.selectedBy());
    }

    public ConsultSourceRouting forRuntime(String runtimeId) {
        return forRuntime(runtimeId, null, null);
    }

    public ConsultSourceRouting forRuntime(String runtimeId, String projectId, String requestedPath) {
        var session = sessions.findByDevSessionId(runtimeId).orElseThrow(() -> new IllegalArgumentException("未关联咨询"));
        var scope = current(session);
        if (scope == null) {
            var root = Path.of(session.getSystemSourcePath());
            access.requireAllowed(root);
            if (catalog.list(false).stream().noneMatch(entry -> entry.available() && !entry.excluded()
                    && key(entry.path()).equals(key(root.toString())))) {
                throw new IllegalArgumentException("原咨询项目已不可用");
            }
        }
        if (requestedPath != null) {
            String rootPath = scope == null ? session.getSystemSourcePath() : scope.projects().stream()
                    .filter(project -> Objects.equals(project.id(), projectId == null ? scope.focusedProject() : projectId))
                    .map(ConsultSourceRouting.Project::path).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("请指定本咨询可用候选 project"));
            try {
                var root = Path.of(rootPath).toRealPath();
                var file = root.resolve(requestedPath).toRealPath();
                if (!file.startsWith(root)) { throw new IllegalArgumentException("源码请求超出候选根目录"); }
                access.requireAllowed(root);
                access.requireAllowed(file);
            } catch (java.io.IOException error) { throw new IllegalArgumentException("源码目标不可用", error); }
        }
        return scope;
    }

    public ConsultSourceRouting focusRuntime(String runtimeId, String project, String evidencePath, String reason) {
        var session = sessions.findByDevSessionId(runtimeId).orElseThrow(() -> new IllegalArgumentException("未关联咨询"));
        return focus(session.getSessionId(), project, evidencePath, reason, false);
    }

    @Transactional
    public ConsultSourceRouting focus(String sessionId, String projectId, String evidencePath, String reason, boolean user) {
        var session = sessions.findById(sessionId).orElseThrow(() -> new IllegalArgumentException("咨询不存在"));
        if (!"PENDING".equals(session.getArchiveStatus())) { throw new IllegalArgumentException("已归档咨询不能切换系统"); }
        var scope = current(session);
        if (scope == null) { throw new IllegalArgumentException("旧咨询没有自动路由范围，请新建自动识别咨询"); }
        if (!user && !scope.automatic()) {
            if (Objects.equals(scope.focusedProject(), projectId)) { return scope; }
            throw new IllegalArgumentException("用户已纠正系统，不得自行切换");
        }
        var project = scope.projects().stream().filter(value -> value.id().equals(projectId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("系统不在本咨询可用候选中"));
        if (!user) {
            if (reason == null || reason.isBlank() || reason.length() > 600) {
                throw new IllegalArgumentException("需说明页面到服务端的定位依据");
            }
            try {
                var root = Path.of(project.path()).toRealPath();
                if (evidencePath == null || Path.of(evidencePath).isAbsolute()) { throw new IllegalArgumentException("需要相对源码路径"); }
                var file = root.resolve(evidencePath).toRealPath();
                access.requireAllowed(file);
                if (!file.startsWith(root) || !Files.isRegularFile(file)
                        || root.relativize(file).toString().replace('\\', '/').startsWith(".git/")) {
                    throw new IllegalArgumentException("文件证据超出目标系统源码范围");
                }
            } catch (java.io.IOException error) { throw new IllegalArgumentException("定位证据文件不可用", error); }
        }
        var selected = new ConsultSourceRouting(!user, project.id(), scope.projects(), evidencePath,
                user ? "用户纠正系统" : reason, user ? "USER" : "MODEL_INFERRED");
        var dataRoute = routes.resolve(project.name(), List.of(), "");
        try {
            sessions.updateSourceRouting(sessionId, project.name(), project.path(), selected.wrap(dataRoute.snapshot(), session.getEvidenceRouteSnapshot()),
                    mapper.writeValueAsString(dataRoute.evidenceSystems()), session.getEvidenceRouteSnapshot());
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
            throw new IllegalStateException("无法保存数据归属", error);
        }
        return selected;
    }

    public static String instructions(ConsultSourceRouting scope) {
        return "【自动系统定位】用户无需预选系统。会话工作目录只是启动锚点，不是截图归属。"
                + "先调用 source_projects 查看有序候选。用户选中的系统排首位，其余按管理员配置顺序；没有选择时直接按管理员顺序。"
                + "必须从上往下逐个根据截图、菜单、提示及源码核对，未命中再查下一个，不得按使用频次或自行重排。排序不等于归属证据。"
                + "图谱预热/排队不是未命中，不反复等待同一项目；利用结构线索继续定位，仍不能确认再按顺序探索其他候选。"
                + "图谱预热时利用 source_context 的有界结构线索读取入口配置、在已确认子目录核对文案，不必等待图谱；仍禁止根目录搜索。"
                + "source_context/source_read/source_search/source_git_history 的 project 参数使用候选 id，不能自行指定目录。"
                + "找到前端后沿请求接口核对服务端，跨项目证据注明来源；确定服务端后用 source_projects(action=select)"
                + "传 project、evidencePath、reason 保存分析焦点。这是模型推断，不能称人工确认的业务事实。"
                + "只有候选仍无法区分时才请求 URL 或最少信息；证据足够即停止。用户纠正的系统优先，不得自行推翻。"
                + "尚未定位服务端时不得查询数据库；定位后仍只用原流程已选择且属于该系统的资源，不能扩大数据库授权。"
                + "当前焦点=" + (scope.focusedProject() == null ? "待识别" : scope.focusedProject())
                + "；候选=" + scope.projects().stream().map(project -> project.id() + ":" + project.label()).toList();
    }

    private static String key(String path) {
        if (path == null) { return ""; }
        String value = Path.of(path).toAbsolutePath().normalize().toString();
        return System.getProperty("os.name", "").toLowerCase(java.util.Locale.ROOT).contains("win")
                ? value.toLowerCase(java.util.Locale.ROOT) : value;
    }
}
