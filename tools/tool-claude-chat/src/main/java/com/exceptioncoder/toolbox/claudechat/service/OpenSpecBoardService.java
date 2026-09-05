package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.BoardList;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.ChangeDetail;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.ChangeState;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.ChangeSummary;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.Freshness;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.ProjectState;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.ProjectSummary;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.RuntimeEvidence;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.Task;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.TaskState;
import com.exceptioncoder.toolbox.claudechat.api.dto.WorkspaceDirView;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecCliGateway.CommandResult;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecRuntimeEvidenceProvider.Evidence;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.Duration;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** 聚合已批准工作区中的 OpenSpec 项目、change 与任务。 */
@Service
public class OpenSpecBoardService {

    private static final String NO_OPEN_SPEC_ROOT = "no_openspec_root";
    private static final String SAFE_CHANGE_ID = "[A-Za-z0-9][A-Za-z0-9._-]{0,119}";
    private static final int MAX_PARALLEL_COMMANDS = 4;
    private static final Duration SNAPSHOT_TTL = Duration.ofSeconds(15);

    private final WorkspaceScanService workspaceScanService;
    private final OpenSpecCliGateway cliGateway;
    private final OpenSpecRuntimeEvidenceProvider runtimeEvidenceProvider;
    private final OpenSpecAffectedApiEvidenceService affectedApiEvidenceService;
    private final OpenSpecBoardJsonAdapter jsonAdapter;
    private final Map<String, Snapshot<ChangeDetail>> changeSnapshots = new ConcurrentHashMap<>();
    private volatile Snapshot<BoardList> boardSnapshot;

    public OpenSpecBoardService(WorkspaceScanService workspaceScanService,
                                OpenSpecCliGateway cliGateway,
                                OpenSpecRuntimeEvidenceProvider runtimeEvidenceProvider,
                                OpenSpecAffectedApiEvidenceService affectedApiEvidenceService,
                                OpenSpecBoardJsonAdapter jsonAdapter) {
        this.workspaceScanService = workspaceScanService;
        this.cliGateway = cliGateway;
        this.runtimeEvidenceProvider = runtimeEvidenceProvider;
        this.affectedApiEvidenceService = affectedApiEvidenceService;
        this.jsonAdapter = jsonAdapter;
    }

    /** 读取所有已批准工作区项目及其活动 change 摘要。 */
    public BoardList boards() {
        return boards(false);
    }

    /** 读取项目摘要；显式刷新时丢弃短期快照。 */
    public BoardList boards(boolean refresh) {
        Snapshot<BoardList> cached = boardSnapshot;
        if (!refresh && fresh(cached)) {
            return cached.value();
        }
        Instant snapshotAt = Instant.now();
        List<Project> allowedProjects = allowedProjects();
        try (ExecutorService executor = boardExecutor()) {
            List<CompletableFuture<ProjectSummary>> inspections = allowedProjects.stream()
                    .map(project -> CompletableFuture.supplyAsync(
                            () -> inspectProject(project, snapshotAt), executor))
                    .toList();
            BoardList value = new BoardList(awaitInspections(inspections), snapshotAt);
            boardSnapshot = new Snapshot<>(value, snapshotAt);
            return value;
        }
    }

    /** 读取已批准项目中的单个活动 change 详情。 */
    public ChangeDetail change(String projectId, String changeId) {
        return change(projectId, changeId, false);
    }

    /** 读取单个需求详情；刷新只失效该需求快照。 */
    public ChangeDetail change(String projectId, String changeId, boolean refresh) {
        if (changeId == null || !changeId.matches(SAFE_CHANGE_ID)) {
            throw new IllegalArgumentException("OpenSpec change 标识不合法");
        }
        Project project = allowedProjects().stream()
                .filter(candidate -> candidate.id().equals(projectId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("OpenSpec 项目不存在或不在允许范围"));
        String cacheKey = projectId + ":" + changeId;
        Snapshot<ChangeDetail> cached = changeSnapshots.get(cacheKey);
        if (!refresh && fresh(cached)) {
            return cached.value();
        }
        try {
            ChangeDetail detail = loadChange(project, changeId);
            changeSnapshots.put(cacheKey, new Snapshot<>(detail, detail.snapshotAt()));
            return detail;
        } catch (IllegalArgumentException exception) {
            if (cached != null) {
                return stale(cached.value());
            }
            throw exception;
        }
    }

    private ChangeDetail loadChange(Project project, String changeId) {
        listedChanges(project.path()).stream()
                .filter(item -> changeId.equals(item.path("name").asText()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("OpenSpec change 不存在或不是活动需求"));
        JsonNode status = requireJson(project.path(), List.of("status", "--change", changeId, "--json"));
        JsonNode apply = requireJson(project.path(),
                List.of("instructions", "apply", "--change", changeId, "--json"));
        Map<String, Evidence> runtimeEvidence = runtimeEvidenceProvider.evidence(project.path(), changeId);
        List<Task> tasks = parseTasks(apply.path("tasks"), runtimeEvidence);
        int completed = apply.path("progress").path("complete").asInt(completedTasks(tasks));
        int total = apply.path("progress").path("total").asInt(tasks.size());
        return new ChangeDetail(project.id(), project.name(), changeId, humanize(changeId),
                changeState(completed, total, tasks), completed, total, artifactPaths(status), tasks,
                affectedApiEvidenceService.evidence(project.path(), changeId), Instant.now(), Freshness.FRESH);
    }

    private ChangeDetail stale(ChangeDetail detail) {
        return new ChangeDetail(detail.projectId(), detail.projectName(), detail.changeId(), detail.title(),
                detail.state(), detail.completedTasks(), detail.totalTasks(), detail.artifactPaths(),
                detail.tasks(), detail.affectedApis(), detail.snapshotAt(), Freshness.STALE);
    }

    private ProjectSummary inspectProject(Project project, Instant snapshotAt) {
        CommandResult context = cliGateway.run(project.path(), List.of("context", "--json"));
        if (!context.started()) {
            return unavailableProject(project, ProjectState.TOOL_UNAVAILABLE,
                    "未找到 OpenSpec CLI，请先在 Forge 环境中安装", snapshotAt);
        }
        if (context.timedOut()) {
            return unavailableProject(project, ProjectState.ERROR, "OpenSpec 项目探测超时", snapshotAt);
        }
        if (context.exitCode() != 0) {
            ProjectState state = context.output().contains(NO_OPEN_SPEC_ROOT)
                    ? ProjectState.NOT_INITIALIZED : ProjectState.ERROR;
            String message = state == ProjectState.NOT_INITIALIZED
                    ? "当前项目尚未初始化 OpenSpec" : "OpenSpec 项目探测失败";
            return unavailableProject(project, state, message, snapshotAt);
        }

        try {
            jsonAdapter.context(context.output());
            List<ChangeSummary> changes = listedChanges(project.path()).stream()
                    .map(this::changeSummary)
                    .toList();
            int completed = changes.stream().mapToInt(ChangeSummary::completedTasks).sum();
            int total = changes.stream().mapToInt(ChangeSummary::totalTasks).sum();
            return new ProjectSummary(project.id(), project.name(), ProjectState.READY, "OpenSpec 已就绪",
                    changes, completed, total, snapshotAt);
        } catch (IllegalArgumentException exception) {
            return unavailableProject(project, ProjectState.ERROR, exception.getMessage(), snapshotAt);
        }
    }

    private ExecutorService boardExecutor() {
        return new ThreadPoolExecutor(MAX_PARALLEL_COMMANDS, MAX_PARALLEL_COMMANDS,
                30L, TimeUnit.SECONDS, new LinkedBlockingQueue<>(),
                Thread.ofVirtual().name("openspec-board-", 0).factory(),
                new ThreadPoolExecutor.AbortPolicy());
    }

    private List<ProjectSummary> awaitInspections(List<CompletableFuture<ProjectSummary>> inspections) {
        List<ProjectSummary> projects = new ArrayList<>(inspections.size());
        for (CompletableFuture<ProjectSummary> inspection : inspections) {
            try {
                projects.add(inspection.get());
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("OpenSpec 项目读取被中断", exception);
            } catch (ExecutionException exception) {
                throw new IllegalStateException("OpenSpec 项目读取失败", exception.getCause());
            }
        }
        return List.copyOf(projects);
    }

    private List<JsonNode> listedChanges(Path projectDirectory) {
        CommandResult result = requireSuccessful(projectDirectory, List.of("list", "--json"));
        return jsonAdapter.changes(result.output());
    }

    private JsonNode requireJson(Path projectDirectory, List<String> arguments) {
        CommandResult result = requireSuccessful(projectDirectory, arguments);
        String command = arguments.getFirst();
        if ("status".equals(command)) {
            return jsonAdapter.status(result.output());
        }
        if ("instructions".equals(command)) {
            return jsonAdapter.apply(result.output());
        }
        return jsonAdapter.context(result.output());
    }

    private CommandResult requireSuccessful(Path projectDirectory, List<String> arguments) {
        CommandResult result = cliGateway.run(projectDirectory, arguments);
        if (!result.started()) {
            throw new IllegalArgumentException("OpenSpec CLI 不可用");
        }
        if (result.timedOut()) {
            throw new IllegalArgumentException("OpenSpec CLI 执行超时");
        }
        if (result.exitCode() != 0) {
            throw new IllegalArgumentException("OpenSpec CLI 返回失败");
        }
        return result;
    }

    private ChangeSummary changeSummary(JsonNode node) {
        int completed = node.path("completedTasks").asInt(0);
        int total = node.path("totalTasks").asInt(0);
        String id = node.path("name").asText();
        ChangeState state = completed >= total && total > 0 ? ChangeState.COMPLETE : ChangeState.IN_PROGRESS;
        return new ChangeSummary(id, humanize(id), state, completed, total, parseInstant(node.path("lastModified")));
    }

    private List<Task> parseTasks(JsonNode taskNodes, Map<String, Evidence> runtimeEvidence) {
        List<Task> tasks = new ArrayList<>();
        int index = 0;
        for (JsonNode node : taskNodes) {
            index++;
            String id = node.path("id").asText(Integer.toString(index));
            String description = node.path("description").asText("");
            String outlineId = outlineId(description).orElse(id);
            String section = outlineId.contains(".") ? outlineId.substring(0, outlineId.indexOf('.')) : "";
            boolean done = node.path("done").asBoolean(false);
            Evidence evidence = runtimeEvidence.get(id);
            TaskState state = done ? TaskState.DONE : trustedState(evidence);
            RuntimeEvidence detail = done || evidence == null ? null : evidence.detail();
            tasks.add(new Task(id, outlineId, stripOutline(description, outlineId), section, state, detail));
        }
        return List.copyOf(tasks);
    }

    private TaskState trustedState(Evidence evidence) {
        if (evidence == null || evidence.state() == null || evidence.state() == TaskState.DONE) {
            return TaskState.TODO;
        }
        return evidence.state();
    }

    private Map<String, List<String>> artifactPaths(JsonNode status) {
        Map<String, List<String>> paths = new LinkedHashMap<>();
        status.path("artifactPaths").fields().forEachRemaining(entry -> {
            List<String> relativePaths = new ArrayList<>();
            entry.getValue().path("existingOutputPaths").forEach(path ->
                    relativePaths.add(projectRelativePath(status, path.asText())));
            paths.put(entry.getKey(), List.copyOf(relativePaths));
        });
        return Map.copyOf(paths);
    }

    private String projectRelativePath(JsonNode status, String absolutePath) {
        String root = status.path("planningHome").path("root").asText();
        try {
            return Path.of(root).toAbsolutePath().normalize()
                    .relativize(Path.of(absolutePath).toAbsolutePath().normalize()).toString().replace('\\', '/');
        } catch (RuntimeException exception) {
            return "";
        }
    }

    private List<Project> allowedProjects() {
        Map<String, Project> projects = new LinkedHashMap<>();
        workspaceScanService.scan().roots().stream()
                .filter(root -> root.exists())
                .flatMap(root -> root.dirs().stream())
                .forEach(directory -> addProject(projects, directory));
        return List.copyOf(projects.values());
    }

    private void addProject(Map<String, Project> projects, WorkspaceDirView directory) {
        Path path = Path.of(directory.path()).toAbsolutePath().normalize();
        projects.putIfAbsent(path.toString().toLowerCase(Locale.ROOT),
                new Project(projectId(path), directory.displayName(), path));
    }

    private ProjectSummary unavailableProject(Project project, ProjectState state, String message, Instant snapshotAt) {
        return new ProjectSummary(project.id(), project.name(), state, message, List.of(), 0, 0, snapshotAt);
    }

    private ChangeState changeState(int completed, int total, List<Task> tasks) {
        if (total > 0 && completed >= total) {
            return ChangeState.COMPLETE;
        }
        boolean attention = tasks.stream().anyMatch(task -> task.state() == TaskState.BLOCKED);
        return attention ? ChangeState.ATTENTION : ChangeState.IN_PROGRESS;
    }

    private int completedTasks(List<Task> tasks) {
        return (int) tasks.stream().filter(task -> task.state() == TaskState.DONE).count();
    }

    private Optional<String> outlineId(String description) {
        int separator = description.indexOf(' ');
        String candidate = separator < 0 ? description : description.substring(0, separator);
        return candidate.matches("\\d+(?:\\.\\d+)+") ? Optional.of(candidate) : Optional.empty();
    }

    private String stripOutline(String description, String outlineId) {
        String prefix = outlineId + " ";
        return description.startsWith(prefix) ? description.substring(prefix.length()).trim() : description.trim();
    }

    private String humanize(String changeId) {
        String[] words = changeId.split("[-_]");
        StringBuilder title = new StringBuilder();
        for (String word : words) {
            if (word.isBlank()) {
                continue;
            }
            if (!title.isEmpty()) {
                title.append(' ');
            }
            title.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return title.toString();
    }

    private Instant parseInstant(JsonNode node) {
        try {
            return Instant.parse(node.asText());
        } catch (DateTimeParseException exception) {
            return null;
        }
    }

    private boolean fresh(Snapshot<?> snapshot) {
        return snapshot != null && snapshot.createdAt().plus(SNAPSHOT_TTL).isAfter(Instant.now());
    }

    private String projectId(Path path) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(path.toString().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest, 0, 8);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("运行环境不支持 SHA-256", exception);
        }
    }

    private record Project(String id, String name, Path path) {
    }

    private record Snapshot<T>(T value, Instant createdAt) {
    }
}
