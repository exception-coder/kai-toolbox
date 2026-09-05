package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.SessionAutopilotView;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.RuntimeEvidence;
import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.TaskState;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionAutopilotView.Dashboard;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionAutopilotView.DashboardItem;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionAutopilotView.Run;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotCompletionPolicy;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotDisposition;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotState;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotStep;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAutopilotRepository;
import com.exceptioncoder.toolbox.claudechat.service.ContinuousExecutionSkillProvisioner.ProvisioningResult;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeOption;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.TaskSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecContinuousRunner.Decision;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionAutopilotChangedEvent;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionCapabilitiesObservedEvent;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionManualInputEvent;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionQueueReleaseRequestedEvent;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionTurnSettledEvent;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** 会话自动监督用例：绑定 OpenSpec、持久决策、续跑和人工接管。 */
@Service
@Primary
public class SessionAutopilotService implements OpenSpecRuntimeEvidenceProvider {

    private static final Logger LOGGER = LoggerFactory.getLogger(SessionAutopilotService.class);
    private static final int DEFAULT_MAX_TURNS = 60;
    private static final int DEFAULT_MAX_NO_PROGRESS = 3;
    private static final Duration DEFAULT_DEADLINE = Duration.ofHours(8);
    private static final int MAX_REPORT_ITEMS = 20;
    private static final int MAX_REPORT_TEXT = 2_000;
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() { };

    private final SessionAutopilotRepository repository;
    private final ClaudeChatSessionRepository sessionRepository;
    private final ClaudeChatSessionAccessPolicy accessPolicy;
    private final QueuedChatMessageService queuedMessages;
    private final SessionRuntimeStateService runtimeStates;
    private final AutopilotProjectContextResolver projectResolver;
    private final OpenSpecAutopilotAdapter openSpec;
    private final OpenSpecContinuousRunner continuousRunner;
    private final ContinuousExecutionSkillProvisioner skillProvisioner;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher events;

    public SessionAutopilotService(SessionAutopilotRepository repository,
                                   ClaudeChatSessionRepository sessionRepository,
                                   ClaudeChatSessionAccessPolicy accessPolicy,
                                   QueuedChatMessageService queuedMessages,
                                   SessionRuntimeStateService runtimeStates,
                                   AutopilotProjectContextResolver projectResolver,
                                   OpenSpecAutopilotAdapter openSpec,
                                   OpenSpecContinuousRunner continuousRunner,
                                   ContinuousExecutionSkillProvisioner skillProvisioner,
                                   ObjectMapper objectMapper,
                                   ApplicationEventPublisher events) {
        this.repository = repository;
        this.sessionRepository = sessionRepository;
        this.accessPolicy = accessPolicy;
        this.queuedMessages = queuedMessages;
        this.runtimeStates = runtimeStates;
        this.projectResolver = projectResolver;
        this.openSpec = openSpec;
        this.continuousRunner = continuousRunner;
        this.skillProvisioner = skillProvisioner;
        this.objectMapper = objectMapper;
        this.events = events;
    }

    public List<SessionAutopilotView.ChangeOption> listChanges(String sessionId, String projectRoot) {
        AutopilotProjectContextResolver.ProjectIdentity identity = projectResolver.resolve(sessionId, projectRoot);
        return openSpec.listChanges(identity.projectRoot()).stream()
                .map(change -> new SessionAutopilotView.ChangeOption(change.id(), change.completedTasks(),
                        change.totalTasks(), change.lastModified()))
                .toList();
    }

    public Run start(String sessionId, StartRequest request) {
        if (request == null || request.changeId() == null || request.changeId().isBlank()) {
            throw new IllegalArgumentException("请选择要监督的 OpenSpec change");
        }
        AutopilotProjectContextResolver.ProjectIdentity identity =
                projectResolver.resolve(sessionId, request.projectRoot());
        ChangeOption selected = openSpec.listChanges(identity.projectRoot()).stream()
                .filter(change -> request.changeId().equals(change.id()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("OpenSpec change 不存在或已归档"));
        ChangeSnapshot snapshot = openSpec.inspect(identity.projectRoot(), selected.id());
        ProvisioningResult skill = skillProvisioner.provision(identity.projectRoot());
        Instant now = Instant.now();
        long generation = repository.findBySessionId(sessionId)
                .map(run -> run.context().generation() + 1).orElse(1L);
        TaskSnapshot task = snapshot.nextTask();
        OpenSpecExecutionContext context = new OpenSpecExecutionContext(
                identity.projectRoot().toString(), identity.repositoryIdentity(), identity.branch(),
                identity.workspaceFingerprint(), snapshot.changeId(), snapshot.revision(),
                task == null ? null : task.id(), task == null ? null : task.applyOrdinal(),
                OpenSpecExecutionPhase.APPLY, identity.agentSessionRef(), generation, 0L);
        AutopilotState state = skill.ready() ? AutopilotState.ACTIVE : AutopilotState.WAITING_USER;
        String reason = skill.ready() ? "Runtime 已接管，等待下一轮执行"
                : "Continuous Execution Skill 名称与用户文件冲突：" + String.join("、", skill.collisions());
        SessionAutopilotRun run = new SessionAutopilotRun(
                UUID.randomUUID().toString(), sessionId, requiredGoal(request.goal(), selected.id()),
                AutopilotCompletionPolicy.OPEN_SPEC_STRICT, state, reason, context,
                0, bounded(request.maxTurns(), 1, 200, DEFAULT_MAX_TURNS), 0,
                bounded(request.maxNoProgress(), 1, 10, DEFAULT_MAX_NO_PROGRESS), request.autoArchive(),
                false, String.join(",", skill.installedPaths()), skill.version(), skill.fingerprint(), true,
                snapshot.completedTasks(), snapshot.totalTasks(), null, null, null, null, null, null,
                now, now.plus(boundedDuration(request.deadlineMinutes())), now);
        repository.replace(run);
        publish(run);
        if (run.state() == AutopilotState.ACTIVE) {
            queueContinuation(run, snapshot, "开始监督");
        }
        return toView(run, snapshot.artifactPaths());
    }

    public Optional<Run> current(String sessionId) {
        return repository.findBySessionId(sessionId).map(run -> toView(run, artifactPaths(run)));
    }

    public Run action(String sessionId, String action, long expectedVersion) {
        SessionAutopilotRun current = repository.findBySessionId(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("当前会话尚未启用自动监督"));
        requireVersion(current, expectedVersion);
        Instant now = Instant.now();
        SessionAutopilotRun next = switch (action == null ? "" : action.toLowerCase()) {
            case "pause" -> evolve(current, AutopilotState.PAUSED, "用户暂停自动监督", current.context(),
                    current.turnCount(), current.noProgressCount(), current.completedTasks(), current.totalTasks(),
                    false, now);
            case "stop" -> evolve(current, AutopilotState.STOPPED, "用户停止自动监督", current.context(),
                    current.turnCount(), current.noProgressCount(), current.completedTasks(), current.totalTasks(),
                    false, now);
            case "resume" -> resume(current, now);
            default -> throw new IllegalArgumentException("不支持的自动监督动作");
        };
        persist(current, next);
        if (next.state() != AutopilotState.ACTIVE) {
            queuedMessages.clearInternal(sessionId);
        }
        publish(next);
        if (next.state() == AutopilotState.ACTIVE) {
            if (!archiveConfirmed(next)) {
                queueContinuation(next, openSpec.inspect(Path.of(next.context().projectRoot()),
                        next.context().changeId()), "恢复监督");
            }
        }
        return toView(next, artifactPaths(next));
    }

    /** MCP 只提交候选处置；session/run/generation 均由服务端当前绑定决定。 */
    public Run reportProgress(String sessionId, ProgressReport request) {
        if (request == null || request.disposition() == null) {
            throw new IllegalArgumentException("进度处置不能为空");
        }
        AutopilotDisposition disposition;
        try {
            disposition = AutopilotDisposition.valueOf(request.disposition().trim().toUpperCase());
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("进度处置不受支持", exception);
        }
        if (disposition == AutopilotDisposition.CONTINUE
                && (request.nextAction() == null || request.nextAction().isBlank())) {
            throw new IllegalArgumentException("CONTINUE 必须提供 nextAction");
        }
        if ((disposition == AutopilotDisposition.WAITING_USER
                || disposition == AutopilotDisposition.BLOCKED
                || disposition == AutopilotDisposition.FAILED)
                && (request.reason() == null || request.reason().isBlank())) {
            throw new IllegalArgumentException("暂停或失败处置必须提供 reason");
        }
        for (int attempt = 0; attempt < 3; attempt++) {
            SessionAutopilotRun current = repository.findBySessionId(sessionId)
                    .orElseThrow(() -> new IllegalArgumentException("当前会话没有活动的自动监督运行"));
            if (current.state() != AutopilotState.ACTIVE) {
                throw new IllegalStateException("自动监督当前不接受进度上报：" + current.state());
            }
            Instant now = Instant.now();
            OpenSpecExecutionContext context = incrementVersion(current.context());
            String remainingJson = writeList(request.remainingWork());
            String evidenceJson = writeList(request.evidence());
            SessionAutopilotRun next = new SessionAutopilotRun(
                    current.id(), current.sessionId(), current.goal(), current.completionPolicy(), current.state(),
                    boundedText(request.reason()), context, current.turnCount(), current.maxTurns(),
                    current.noProgressCount(), current.maxNoProgress(), current.autoArchive(),
                    current.skillActivated(), current.skillPath(), current.skillVersion(), current.skillFingerprint(),
                    current.runtimeSupervision(), current.completedTasks(), current.totalTasks(), disposition,
                    boundedText(request.summary()), boundedText(request.nextAction()), remainingJson, evidenceJson,
                    now, current.startedAt(), current.deadlineAt(), now);
            if (repository.update(next, current.context().version())) {
                publish(next);
                return toView(next, artifactPaths(next));
            }
        }
        throw new IllegalStateException("自动监督状态已变化，请重新上报当前进度");
    }

    public Dashboard dashboard(String scope, String search, String cursor, int requestedLimit) {
        Cursor parsed = Cursor.parse(cursor);
        int limit = Math.max(1, Math.min(requestedLimit <= 0 ? 30 : requestedLimit, 100));
        List<SessionAutopilotRun> candidates = repository.findRecent(search, null, null, 200);
        List<SessionAutopilotRun> scoped = repository.findRecentByStates(search, parsed.updatedAt(), parsed.id(),
                Math.min(200, limit + 20), statesForScope(scope));
        List<SessionAutopilotRun> accessible = scoped.stream()
                .filter(run -> accessPolicy.canAccessCurrentUser(run.sessionId()))
                .toList();
        List<SessionAutopilotRun> page = accessible.stream().limit(limit).toList();
        List<DashboardItem> items = page.stream().map(this::dashboardItem).toList();
        String nextCursor = accessible.size() > limit && !page.isEmpty()
                ? Cursor.of(page.getLast()).encode() : null;
        Map<AutopilotState, Long> counts = new EnumMap<>(AutopilotState.class);
        candidates.stream().filter(run -> accessPolicy.canAccessCurrentUser(run.sessionId()))
                .forEach(run -> counts.merge(run.state(), 1L, Long::sum));
        SessionAutopilotView.Counts viewCounts = new SessionAutopilotView.Counts(
                counts.getOrDefault(AutopilotState.ACTIVE, 0L),
                counts.getOrDefault(AutopilotState.WAITING_USER, 0L)
                        + counts.getOrDefault(AutopilotState.FAILED, 0L),
                counts.getOrDefault(AutopilotState.PAUSED, 0L),
                counts.getOrDefault(AutopilotState.COMPLETED, 0L)
                        + counts.getOrDefault(AutopilotState.STOPPED, 0L));
        return new Dashboard(items, viewCounts, nextCursor, Instant.now());
    }

    /** 启动与低频巡检仅恢复可安全发送且没有待发续跑消息的活动运行。 */
    public void reconcileActiveRuns() {
        repository.findRecent("", null, null, 200).stream()
                .filter(run -> run.state() == AutopilotState.ACTIVE)
                .filter(run -> run.budgetAvailable(Instant.now()))
                .filter(run -> !queuedMessages.hasInternal(run.sessionId()))
                .filter(run -> runtimeStates.canStartTurn(run.sessionId()).allowed())
                .forEach(run -> {
                    try {
                        queueContinuation(run, openSpec.inspect(Path.of(run.context().projectRoot()),
                                run.context().changeId()), "重启/断线恢复巡检");
                    } catch (RuntimeException exception) {
                        LOGGER.warn("[autopilot] 恢复巡检失败 session={}", run.sessionId(), exception);
                    }
                });
    }

    @EventListener
    public void onSettled(SessionTurnSettledEvent event) {
        Thread.startVirtualThread(() -> repository.findBySessionId(event.sessionId())
                .filter(run -> run.state() == AutopilotState.ACTIVE)
                .ifPresent(run -> evaluateSettled(run, event)));
    }

    @EventListener
    public void onManualInput(SessionManualInputEvent event) {
        repository.findBySessionId(event.sessionId())
                .filter(run -> run.state() == AutopilotState.ACTIVE)
                .ifPresent(run -> {
                    SessionAutopilotRun paused = evolve(run, AutopilotState.PAUSED,
                            "用户通过 " + event.action() + " 接管会话", run.context(), run.turnCount(),
                            run.noProgressCount(), run.completedTasks(), run.totalTasks(), false, Instant.now());
                    if (repository.update(paused, run.context().version())) {
                        queuedMessages.clearInternal(run.sessionId());
                        publish(paused);
                    }
                });
    }

    @EventListener
    public void onCapabilitiesObserved(SessionCapabilitiesObservedEvent event) {
        repository.findBySessionId(event.sessionId())
                .filter(run -> run.skillFingerprint() != null
                        && run.skillFingerprint().equals(event.skillFingerprint())
                        && run.skillVersion() != null && run.skillVersion().equals(event.skillVersion()))
                .filter(run -> !run.skillActivated())
                .ifPresent(run -> {
                    Instant now = Instant.now();
                    OpenSpecExecutionContext context = incrementVersion(run.context());
                    SessionAutopilotRun activated = new SessionAutopilotRun(
                            run.id(), run.sessionId(), run.goal(), run.completionPolicy(), run.state(), run.reason(),
                            context, run.turnCount(), run.maxTurns(), run.noProgressCount(), run.maxNoProgress(),
                            run.autoArchive(), true, event.skillPath(), run.skillVersion(), run.skillFingerprint(),
                            run.runtimeSupervision(), run.completedTasks(), run.totalTasks(), run.latestDisposition(),
                            run.latestSummary(), run.latestNextAction(), run.latestRemainingWorkJson(),
                            run.latestEvidenceJson(), run.latestReportAt(), run.startedAt(), run.deadlineAt(), now);
                    if (repository.update(activated, run.context().version())) {
                        publish(activated);
                    }
                });
    }

    /** 看板把 Runtime 当前任务投影为 OpenSpec 任务的可信运行证据。 */
    @Override
    public Map<String, Evidence> evidence(Path projectDirectory, String changeId) {
        return repository.findRecent(changeId, null, null, 200).stream()
                .filter(run -> changeId.equals(run.context().changeId()))
                .filter(run -> run.context().currentTaskOrdinal() != null)
                .filter(run -> workspaceFingerprintMatches(run, projectDirectory))
                .findFirst()
                .map(run -> Map.of(Integer.toString(run.context().currentTaskOrdinal()),
                        new Evidence(taskState(run.state()), new RuntimeEvidence(
                                run.sessionId(), sessionRepository.findById(run.sessionId())
                                .map(ClaudeChatSession::getEngine).orElse("unknown"), run.context().phase().name(),
                                run.updatedAt(), run.reason()))))
                .orElseGet(Map::of);
    }

    private boolean workspaceFingerprintMatches(SessionAutopilotRun run, Path projectDirectory) {
        try {
            String currentFingerprint = projectResolver.resolve(run.sessionId(), projectDirectory.toString())
                    .workspaceFingerprint();
            return OpenSpecRuntimeEvidencePolicy.accepts(run, projectDirectory, currentFingerprint, Instant.now());
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private void evaluateSettled(SessionAutopilotRun run, SessionTurnSettledEvent event) {
        String turnId = event.turnId() == null || event.turnId().isBlank()
                ? "terminal-" + event.settledAt() : event.turnId();
        if (!successful(event.stopReason()) || !event.queueReleaseSafe()) {
            finishDecision(run, event, turnId, AutopilotState.PAUSED,
                    "上一轮未形成可安全续跑的成功终态", run.context(), run.noProgressCount());
            return;
        }
        if (!run.budgetAvailable(Instant.now())) {
            finishDecision(run, event, turnId, AutopilotState.PAUSED,
                    "自动监督已达到轮次或时间预算", run.context(), run.noProgressCount());
            return;
        }
        if (run.latestDisposition() == AutopilotDisposition.WAITING_USER
                || run.latestDisposition() == AutopilotDisposition.BLOCKED) {
            finishDecision(run, event, turnId, AutopilotState.WAITING_USER,
                    reportReason(run), run.context(), run.noProgressCount());
            return;
        }
        try {
            ChangeSnapshot snapshot = openSpec.inspect(Path.of(run.context().projectRoot()),
                    run.context().changeId());
            Decision decision = continuousRunner.decide(run, snapshot);
            if (!repository.appendStep(new AutopilotStep(run.id(), run.context().generation(), turnId,
                    decision.messageId(), run.context().phase(), run.context().currentTaskId(), decision.code(),
                    boundedText(run.latestSummary()), boundedText(run.latestEvidenceJson()),
                    decision.progressFingerprint(), Instant.now()))) {
                return;
            }
            SessionAutopilotRun next = evolve(run, decision.state(), decision.reason(), decision.context(),
                    run.turnCount() + 1, decision.noProgressCount(), snapshot.completedTasks(), snapshot.totalTasks(),
                    true, Instant.now());
            persist(run, next);
            publish(next);
            if (next.state() == AutopilotState.ACTIVE) {
                queueContinuation(next, snapshot, decision.reason());
            }
        } catch (RuntimeException exception) {
            if (run.context().phase() == OpenSpecExecutionPhase.ARCHIVE
                    && openSpec.isArchived(Path.of(run.context().projectRoot()),
                    run.context().repositoryIdentity(), run.context().changeId())) {
                OpenSpecExecutionContext done = new OpenSpecExecutionContext(
                        run.context().projectRoot(), run.context().repositoryIdentity(), run.context().branchAtStart(),
                        run.context().workspaceFingerprint(), run.context().changeId(),
                        run.context().changeRevision(), null, null, OpenSpecExecutionPhase.DONE,
                        run.context().agentSessionRef(), run.context().generation(), run.context().version() + 1);
                finishDecision(run, event, turnId, AutopilotState.COMPLETED,
                        "已确认 OpenSpec 归档，恢复为完成状态", done, 0);
                return;
            }
            LOGGER.warn("[autopilot] settled 评估失败 session={}", run.sessionId(), exception);
            finishDecision(run, event, turnId, AutopilotState.WAITING_USER,
                    "无法读取当前 OpenSpec 状态：" + boundedText(exception.getMessage()),
                    run.context(), run.noProgressCount());
        }
    }

    private void finishDecision(SessionAutopilotRun run, SessionTurnSettledEvent event, String turnId,
                                AutopilotState state, String reason, OpenSpecExecutionContext context,
                                int noProgress) {
        if (!repository.appendStep(new AutopilotStep(run.id(), run.context().generation(), turnId, null,
                run.context().phase(), run.context().currentTaskId(), state.name(), reason,
                run.latestEvidenceJson(), progressFingerprint(run), Instant.now()))) {
            return;
        }
        SessionAutopilotRun next = evolve(run, state, reason, context, run.turnCount() + 1,
                noProgress, run.completedTasks(), run.totalTasks(), true, Instant.now());
        if (repository.update(next, run.context().version())) {
            publish(next);
        }
    }

    private SessionAutopilotRun resume(SessionAutopilotRun run, Instant now) {
        if (archiveConfirmed(run)) {
            OpenSpecExecutionContext context = new OpenSpecExecutionContext(
                    run.context().projectRoot(), run.context().repositoryIdentity(), run.context().branchAtStart(),
                    run.context().workspaceFingerprint(), run.context().changeId(), run.context().changeRevision(),
                    null, null, OpenSpecExecutionPhase.ARCHIVE, run.context().agentSessionRef(),
                    run.context().generation() + 1, run.context().version() + 1);
            Instant deadline = run.deadlineAt().isAfter(now) ? run.deadlineAt() : now.plus(DEFAULT_DEADLINE);
            return new SessionAutopilotRun(run.id(), run.sessionId(), run.goal(), run.completionPolicy(),
                    AutopilotState.ACTIVE, "已发现 OpenSpec 归档，等待当前轮次完成确认", context,
                    run.turnCount(), run.maxTurns(), 0, run.maxNoProgress(), run.autoArchive(),
                    run.skillActivated(), run.skillPath(), run.skillVersion(), run.skillFingerprint(), true,
                    run.completedTasks(), run.totalTasks(), null, null, null, null, null, null,
                    run.startedAt(), deadline, now);
        }
        ChangeSnapshot snapshot = openSpec.inspect(Path.of(run.context().projectRoot()), run.context().changeId());
        TaskSnapshot task = snapshot.nextTask();
        OpenSpecExecutionContext context = new OpenSpecExecutionContext(
                run.context().projectRoot(), run.context().repositoryIdentity(), run.context().branchAtStart(),
                run.context().workspaceFingerprint(), run.context().changeId(), snapshot.revision(),
                task == null ? null : task.id(), task == null ? null : task.applyOrdinal(),
                task == null ? run.context().phase() : OpenSpecExecutionPhase.APPLY,
                run.context().agentSessionRef(), run.context().generation() + 1,
                run.context().version() + 1);
        Instant deadline = run.deadlineAt().isAfter(now) ? run.deadlineAt() : now.plus(DEFAULT_DEADLINE);
        return new SessionAutopilotRun(run.id(), run.sessionId(), run.goal(), run.completionPolicy(),
                AutopilotState.ACTIVE, "用户恢复自动监督", context, run.turnCount(), run.maxTurns(), 0,
                run.maxNoProgress(), run.autoArchive(), run.skillActivated(), run.skillPath(), run.skillVersion(),
                run.skillFingerprint(), true, snapshot.completedTasks(), snapshot.totalTasks(), null, null, null,
                null, null, null, run.startedAt(), deadline, now);
    }

    private boolean archiveConfirmed(SessionAutopilotRun run) {
        return (run.context().phase() == OpenSpecExecutionPhase.ARCHIVE
                || run.context().phase() == OpenSpecExecutionPhase.DONE)
                && openSpec.isArchived(Path.of(run.context().projectRoot()),
                run.context().repositoryIdentity(), run.context().changeId());
    }

    private void queueContinuation(SessionAutopilotRun run, ChangeSnapshot snapshot, String reason) {
        String task = run.context().currentTaskId() == null ? "-" : run.context().currentTaskId();
        String messageId = "autopilot:" + run.id() + ":" + run.context().generation() + ":"
                + run.context().phase().name().toLowerCase() + ":" + task + ":" + run.turnCount();
        String display = "自动推进 · " + run.context().changeId() + " · "
                + ("-".equals(task) ? run.context().phase().name() : "task " + task);
        String text = "继续执行 Forge 已绑定的 OpenSpec 自动监督下一步。";
        String instructions = continuationInstructions(run, snapshot, reason);
        queuedMessages.saveInternal(run.sessionId(), messageId, text, display, instructions,
                System.currentTimeMillis());
        events.publishEvent(new SessionQueueReleaseRequestedEvent(run.sessionId()));
    }

    private String continuationInstructions(SessionAutopilotRun run, ChangeSnapshot snapshot, String reason) {
        String task = run.context().currentTaskId() == null ? "无" : run.context().currentTaskId();
        return """
                你正在由 Forge Runtime 自动监督。不要请求用户说“继续”，也不要把单轮结束当作目标完成。
                Active goal: %s
                Project root: %s
                OpenSpec change: %s
                Phase: %s
                Current task: %s
                Progress: %d/%d
                Runtime decision: %s
                Turn budget: %d/%d; no-progress budget: %d/%d

                只执行上述绑定上下文中的下一步。完成或遇到真实阻塞前，遵守
                forge-openspec-continuous-execution Skill。yield 前必须调用
                forge.report_session_progress；不要从自然语言自行切换 change 或 task。
                """.formatted(run.goal(), run.context().projectRoot(), run.context().changeId(),
                run.context().phase(), task, snapshot.completedTasks(), snapshot.totalTasks(), reason,
                run.turnCount(), run.maxTurns(), run.noProgressCount(), run.maxNoProgress());
    }

    private void persist(SessionAutopilotRun current, SessionAutopilotRun next) {
        if (!repository.update(next, current.context().version())) {
            throw new IllegalStateException("自动监督状态已被其它操作更新，请刷新后重试");
        }
    }

    private void publish(SessionAutopilotRun run) {
        events.publishEvent(new SessionAutopilotChangedEvent(run.sessionId(), run.context().version(),
                toView(run, Map.of())));
    }

    private Run toView(SessionAutopilotRun run, Map<String, List<String>> artifactPaths) {
        SessionAutopilotView.LayerStatus layers = new SessionAutopilotView.LayerStatus(
                run.skillPath() != null && !run.skillPath().isBlank(), run.skillActivated(), run.skillPath(),
                run.skillVersion(), run.skillFingerprint(), run.runtimeSupervision());
        SessionAutopilotView.Progress progress = new SessionAutopilotView.Progress(
                run.completedTasks(), run.totalTasks());
        SessionAutopilotView.Report report = run.latestDisposition() == null ? null
                : new SessionAutopilotView.Report(run.latestDisposition().name(), run.latestSummary(),
                run.latestNextAction(), readList(run.latestRemainingWorkJson()),
                readList(run.latestEvidenceJson()), run.latestReportAt());
        OpenSpecExecutionContext context = run.context();
        return new Run(run.id(), run.sessionId(), run.goal(), run.completionPolicy().name(), run.state().name(),
                run.reason(), context.phase().name(), context.projectRoot(), context.repositoryIdentity(),
                context.branchAtStart(), context.workspaceFingerprint(), context.changeId(), context.changeRevision(),
                context.currentTaskId(), context.currentTaskOrdinal(), context.agentSessionRef(),
                context.generation(), context.version(), run.turnCount(), run.maxTurns(), run.noProgressCount(),
                run.maxNoProgress(), run.autoArchive(), layers, progress, report, artifactPaths,
                run.startedAt(), run.deadlineAt(), run.updatedAt());
    }

    private Map<String, List<String>> artifactPaths(SessionAutopilotRun run) {
        if ((run.context().phase() == OpenSpecExecutionPhase.ARCHIVE
                || run.context().phase() == OpenSpecExecutionPhase.DONE) && archiveConfirmed(run)) {
            return Map.of();
        }
        try {
            return openSpec.inspect(Path.of(run.context().projectRoot()), run.context().changeId()).artifactPaths();
        } catch (RuntimeException exception) {
            return Map.of();
        }
    }

    private DashboardItem dashboardItem(SessionAutopilotRun run) {
        ClaudeChatSession session = sessionRepository.findById(run.sessionId()).orElse(null);
        String projectName = Path.of(run.context().projectRoot()).getFileName().toString();
        String title = session == null || session.getTitle() == null || session.getTitle().isBlank()
                ? projectName : session.getTitle();
        return new DashboardItem(toView(run, Map.of()), title, projectName,
                session == null ? "unknown" : session.getEngine(),
                session == null || session.getStatus() == null ? "UNKNOWN" : session.getStatus().name(),
                session == null ? run.updatedAt().toEpochMilli() : session.getLastSeenAt());
    }

    private SessionAutopilotRun evolve(SessionAutopilotRun run, AutopilotState state, String reason,
                                       OpenSpecExecutionContext context, int turnCount, int noProgressCount,
                                       int completedTasks, int totalTasks, boolean clearReport, Instant now) {
        OpenSpecExecutionContext versioned = context.version() == run.context().version()
                ? incrementVersion(context) : context;
        return new SessionAutopilotRun(run.id(), run.sessionId(), run.goal(), run.completionPolicy(), state,
                boundedText(reason), versioned, turnCount, run.maxTurns(), noProgressCount, run.maxNoProgress(),
                run.autoArchive(), run.skillActivated(), run.skillPath(), run.skillVersion(), run.skillFingerprint(),
                run.runtimeSupervision(), completedTasks, totalTasks,
                clearReport ? null : run.latestDisposition(), clearReport ? null : run.latestSummary(),
                clearReport ? null : run.latestNextAction(), clearReport ? null : run.latestRemainingWorkJson(),
                clearReport ? null : run.latestEvidenceJson(), clearReport ? null : run.latestReportAt(),
                run.startedAt(), run.deadlineAt(), now);
    }

    private OpenSpecExecutionContext incrementVersion(OpenSpecExecutionContext context) {
        return new OpenSpecExecutionContext(context.projectRoot(), context.repositoryIdentity(),
                context.branchAtStart(), context.workspaceFingerprint(), context.changeId(), context.changeRevision(),
                context.currentTaskId(), context.currentTaskOrdinal(), context.phase(), context.agentSessionRef(),
                context.generation(), context.version() + 1);
    }

    private String writeList(List<String> values) {
        List<String> bounded = values == null ? List.of() : values.stream().limit(MAX_REPORT_ITEMS)
                .map(this::boundedText).toList();
        try {
            return objectMapper.writeValueAsString(bounded);
        } catch (Exception exception) {
            throw new IllegalArgumentException("进度证据无法序列化", exception);
        }
    }

    private List<String> readList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, STRING_LIST);
        } catch (Exception exception) {
            return List.of("证据数据不可读");
        }
    }

    private String boundedText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim().replaceAll("(?i)(token|password|secret)\\s*[:=]\\s*[^,\\s}]+",
                "$1=[REDACTED]");
        return normalized.length() <= MAX_REPORT_TEXT ? normalized : normalized.substring(0, MAX_REPORT_TEXT);
    }

    private String requiredGoal(String goal, String changeId) {
        return goal == null || goal.isBlank() ? "完成 OpenSpec change " + changeId : boundedText(goal);
    }

    private Duration boundedDuration(Integer minutes) {
        int value = bounded(minutes, 15, 24 * 60, (int) DEFAULT_DEADLINE.toMinutes());
        return Duration.ofMinutes(value);
    }

    private int bounded(Integer value, int minimum, int maximum, int fallback) {
        return value == null ? fallback : Math.max(minimum, Math.min(maximum, value));
    }

    private void requireVersion(SessionAutopilotRun run, long expectedVersion) {
        if (expectedVersion != run.context().version()) {
            throw new IllegalStateException("自动监督状态已更新，请刷新后重试");
        }
    }

    private boolean successful(String stopReason) {
        return stopReason != null && List.of("end_turn", "success", "completed", "stop")
                .contains(stopReason.toLowerCase());
    }

    private String reportReason(SessionAutopilotRun run) {
        return run.reason() == null || run.reason().isBlank() ? "Agent 报告需要用户处理" : run.reason();
    }

    private List<AutopilotState> statesForScope(String scope) {
        return switch (scope == null ? "active" : scope.toLowerCase()) {
            case "attention" -> List.of(AutopilotState.WAITING_USER, AutopilotState.FAILED);
            case "paused" -> List.of(AutopilotState.PAUSED);
            case "recent" -> List.of(AutopilotState.COMPLETED, AutopilotState.STOPPED);
            default -> List.of(AutopilotState.ACTIVE);
        };
    }

    private TaskState taskState(AutopilotState state) {
        return switch (state) {
            case ACTIVE -> TaskState.IN_PROGRESS;
            case WAITING_USER, PAUSED -> TaskState.BLOCKED;
            case FAILED -> TaskState.IN_REVIEW;
            case COMPLETED, STOPPED -> TaskState.TODO;
        };
    }

    private String progressFingerprint(SessionAutopilotRun run) {
        return run.context().changeRevision() + ":" + run.context().phase() + ":"
                + run.context().currentTaskId() + ":" + run.completedTasks();
    }

    public record StartRequest(String projectRoot, String changeId, String goal, boolean autoArchive,
                               Integer maxTurns, Integer maxNoProgress, Integer deadlineMinutes) {
    }

    public record ProgressReport(String disposition, String summary, String nextAction,
                                 List<String> remainingWork, List<String> evidence, String reason) {
    }

    private record Cursor(Long updatedAt, String id) {
        static Cursor parse(String value) {
            if (value == null || value.isBlank()) {
                return new Cursor(null, null);
            }
            try {
                String decoded = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
                String[] parts = decoded.split(":", 2);
                return new Cursor(Long.parseLong(parts[0]), parts[1]);
            } catch (RuntimeException exception) {
                throw new IllegalArgumentException("看板游标不合法", exception);
            }
        }

        static Cursor of(SessionAutopilotRun run) {
            return new Cursor(run.updatedAt().toEpochMilli(), run.id());
        }

        String encode() {
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString((updatedAt + ":" + id).getBytes(StandardCharsets.UTF_8));
        }
    }
}
