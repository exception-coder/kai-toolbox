package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.service.governance.ProjectExecutionControlStore;

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
import com.exceptioncoder.toolbox.claudechat.service.autopilot.AutopilotTurnHandoff;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.AutopilotBatchDeferralPlanner;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionAutopilotChangedEvent;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionCapabilitiesObservedEvent;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionManualInputEvent;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionQueueReleaseRequestedEvent;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionTurnSettledEvent;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionReadinessResultEvent;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.ReadinessFailureGuard;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.RuntimeProbeFailureGuard;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.EnumMap;
import java.util.List;
import java.util.LinkedHashSet;
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
    private static final String CAPACITY_RETRY_REASON = "模型容量不足，等待后台重试";
    private static final int MAX_CAPACITY_RETRIES = 3;
    private static final Duration DEFAULT_DEADLINE = Duration.ofHours(8);
    private static final int MAX_REPORT_ITEMS = 20;
    private static final int MAX_REPORT_TEXT = 2_000;
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() { };
    private static final TypeReference<Map<String, String>> STRING_MAP = new TypeReference<>() { };
    private final ReadinessFailureGuard readinessFailures = new ReadinessFailureGuard();
    private final RuntimeProbeFailureGuard runtimeProbeFailures = new RuntimeProbeFailureGuard();

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
    private final AutopilotBatchDeferralPlanner batchDeferrals;

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
        this.batchDeferrals = new AutopilotBatchDeferralPlanner(openSpec, objectMapper);
    }

    public List<SessionAutopilotView.ChangeOption> listChanges(String sessionId, String projectRoot) {
        AutopilotProjectContextResolver.ProjectIdentity identity = projectResolver.resolve(sessionId, projectRoot);
        return openSpec.listChanges(identity.projectRoot()).stream()
                .map(change -> new SessionAutopilotView.ChangeOption(change.id(), change.completedTasks(),
                        change.totalTasks(), change.lastModified()))
                .toList();
    }

    @Transactional
    public Run start(String sessionId, StartRequest request) {
        List<String> changeIds = request == null ? List.of() : request.changeIds() == null
                || request.changeIds().isEmpty() ? request.changeId() == null ? List.of() : List.of(request.changeId())
                : request.changeIds();
        if (changeIds.isEmpty() || changeIds.stream().anyMatch(id -> id == null || id.isBlank())
                || changeIds.size() > 10 || new LinkedHashSet<>(changeIds).size() != changeIds.size()) {
            throw new IllegalArgumentException("请选择要监督的 OpenSpec change");
        }
        String firstChangeId = changeIds.getFirst();
        var existing = repository.findBySessionId(sessionId);
        if (existing.isPresent() && existing.get().state() == AutopilotState.ACTIVE) {
            List<String> activeIds = repository.findBatch(sessionId, existing.get().id())
                    .map(batch -> readList(batch.changeIdsJson()))
                    .orElse(List.of(existing.get().context().changeId()));
            if (!activeIds.equals(changeIds)) {
                throw new IllegalArgumentException("当前会话已有监督中的规格，请先暂停或停止");
            }
            return toView(existing.get(), artifactPaths(existing.get()));
        }
        AutopilotProjectContextResolver.ProjectIdentity identity =
                projectResolver.resolve(sessionId, request.projectRoot());
        List<String> available = openSpec.listChanges(identity.projectRoot()).stream()
                .map(ChangeOption::id).toList();
        ChangeSnapshot snapshot = null;
        for (String changeId : changeIds) {
            if (!available.contains(changeId)) throw new IllegalArgumentException(changeId + " 不存在或已归档");
            ChangeSnapshot checked = openSpec.inspect(identity.projectRoot(), changeId);
            String expected = request.expectedRevisions() == null ? request.expectedRevision()
                    : request.expectedRevisions().get(changeId);
            if (expected == null || !expected.equals(checked.revision())) {
                throw new IllegalArgumentException(changeId + " 已变化，请重新预检并确认绑定");
            }
            if (checked.totalTasks() == 0 || checked.nextTask() == null) {
                throw new IllegalArgumentException(changeId + " 没有待执行 task");
            }
            if (!ProjectExecutionControlStore.disabled(identity.projectRoot())) {
                var validation = openSpec.strictValidate(identity.projectRoot(), changeId);
                if (!validation.passed()) {
                    throw new IllegalArgumentException(changeId + " 预检未通过：" + validation.detail());
                }
            }
            if (snapshot == null) snapshot = checked;
        }
        ProvisioningResult skill = skillProvisioner.provision(identity.projectRoot());
        Instant now = Instant.now();
        long generation = existing
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
                UUID.randomUUID().toString(), sessionId, requiredGoal(request.goal(), firstChangeId),
                AutopilotCompletionPolicy.OPEN_SPEC_STRICT, state, reason, context,
                0, bounded(request.maxTurns(), 1, 200,
                        Math.min(200, DEFAULT_MAX_TURNS * changeIds.size())), 0,
                bounded(request.maxNoProgress(), 1, 10, DEFAULT_MAX_NO_PROGRESS), request.autoArchive(),
                false, String.join(",", skill.installedPaths()), skill.version(), skill.fingerprint(), true,
                snapshot.completedTasks(), snapshot.totalTasks(), null, null, null, null, null, null,
                now, now.plus(request.deadlineMinutes() == null
                        ? DEFAULT_DEADLINE.multipliedBy(Math.min(3, changeIds.size()))
                        : boundedDuration(request.deadlineMinutes())), now);
        repository.replace(run);
        if (changeIds.size() > 1) repository.saveBatch(sessionId, run.id(), writeList(changeIds),
                writeMap(request.expectedRevisions()));
        publish(run);
        if (run.state() == AutopilotState.ACTIVE) {
            ChangeSnapshot initial = snapshot;
            if (TransactionSynchronizationManager.isActualTransactionActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        queueContinuation(run, initial, "开始监督");
                    }
                });
            } else {
                queueContinuation(run, initial, "开始监督");
            }
        }
        return toView(run, snapshot.artifactPaths());
    }

    public Optional<Run> current(String sessionId) {
        return repository.findBySessionId(sessionId).map(run -> toView(run, artifactPaths(run)));
    }

    public Optional<BatchView> batch(String sessionId) {
        return repository.findBySessionId(sessionId).flatMap(run -> repository.findBatch(sessionId, run.id())
                .map(batch -> new BatchView(readList(batch.changeIdsJson()), batch.currentIndex(),
                        repository.findDeferredChanges(run.id()))));
    }

    public List<OpenSpecAutopilotAdapter.TaskSnapshot> tasks(String sessionId) {
        return tasks(sessionId, null);
    }

    public List<OpenSpecAutopilotAdapter.TaskSnapshot> tasks(String sessionId, String selectedChangeId) {
        SessionAutopilotRun run = repository.findBySessionId(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("当前会话尚未启用自动监督"));
        String changeId = selectedChangeId == null || selectedChangeId.isBlank()
                ? run.context().changeId() : selectedChangeId;
        List<String> boundIds = repository.findBatch(sessionId, run.id())
                .map(batch -> readList(batch.changeIdsJson())).orElse(List.of(run.context().changeId()));
        if (!boundIds.contains(changeId)) {
            throw new IllegalArgumentException("该规格未绑定到当前会话");
        }
        return openSpec.inspect(Path.of(run.context().projectRoot()), changeId).tasks();
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
            case "reset-budget" -> resume(current, now, true);
            default -> throw new IllegalArgumentException("不支持的自动监督动作");
        };
        persist(current, next);
        if ("reset-budget".equalsIgnoreCase(action)) {
            queuedMessages.clearInternal(sessionId);
            repository.appendStep(new AutopilotStep(next.id(), next.context().generation(),
                    "budget-reset:" + next.context().version(), null, next.context().phase(),
                    next.context().currentTaskId(), "USER_BUDGET_RESET",
                    "用户重置轮次 " + current.turnCount() + "/" + current.maxTurns()
                            + "，保留已完成任务与批次", null, progressFingerprint(current), now));
        }
        if (("resume".equalsIgnoreCase(action) || "reset-budget".equalsIgnoreCase(action))
                && next.state() == AutopilotState.ACTIVE) {
            repository.clearDeferredChange(next.id(), next.context().changeId());
        }
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
            boolean recover = current.state() == AutopilotState.WAITING_USER
                    && disposition == AutopilotDisposition.CONTINUE
                    && request.remainingWork() != null && !request.remainingWork().isEmpty()
                    && runtimeStates.inspect(sessionId).map(state -> !state.stale()
                            && Boolean.TRUE.equals(state.sidecarActive())
                            && Boolean.FALSE.equals(state.pendingDecision())).orElse(false);
            if (current.state() != AutopilotState.ACTIVE && !recover) {
                throw new AutopilotProgressConflictException(current.state(), current.context().version());
            }
            Instant now = Instant.now();
            OpenSpecExecutionContext context = incrementVersion(current.context());
            String remainingJson = writeList(request.remainingWork());
            String evidenceJson = writeList(request.evidence());
            boolean newEvidence = disposition == AutopilotDisposition.CONTINUE
                    && request.evidence() != null && !request.evidence().isEmpty()
                    && !evidenceJson.equals(current.latestEvidenceJson());
            SessionAutopilotRun next = new SessionAutopilotRun(
                    current.id(), current.sessionId(), current.goal(), current.completionPolicy(),
                    recover ? AutopilotState.ACTIVE : current.state(),
                    recover ? "已恢复执行；未完成验证保留待回归" : boundedText(request.reason()),
                    context, current.turnCount(), current.maxTurns(),
                    newEvidence ? 0 : current.noProgressCount(), current.maxNoProgress(), current.autoArchive(),
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
        List<SessionAutopilotRun> candidates = repository.findRecentByStates(search, null, null,
                200, statesForScope("all"));
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

    /** 启动与低频巡检重试待发消息，或为尚未排队的活动运行生成下一轮。 */
    public void reconcileActiveRuns() {
        repository.findRecent("", null, null, 200).stream()
                .filter(run -> run.state() == AutopilotState.ACTIVE)
                .filter(run -> {
                    if (run.budgetAvailable(Instant.now())) return true;
                    pauseForBudget(run);
                    return false;
                })
                .filter(run -> capacityRetryCount(run.reason()) == 0
                        || !run.updatedAt().plusSeconds(30L * capacityRetryCount(run.reason()))
                        .isAfter(Instant.now()))
                .forEach(run -> {
                    try {
                        if (!runtimeReadyForContinuation(run, Instant.now())) return;
                        if (queuedMessages.hasInternal(run.sessionId())) {
                            events.publishEvent(new SessionQueueReleaseRequestedEvent(run.sessionId()));
                            return;
                        }
                        queueContinuation(run, openSpec.inspect(Path.of(run.context().projectRoot()),
                                run.context().changeId()), "重启/断线恢复巡检");
                    } catch (RuntimeException exception) {
                        LOGGER.warn("[autopilot] 恢复巡检失败 session={}", run.sessionId(), exception);
                    }
                });
    }

    @EventListener
    public void onReadinessResult(SessionReadinessResultEvent event) {
        SessionAutopilotRun observed = repository.findBySessionId(event.sessionId()).orElse(null);
        if (observed == null || observed.state() != AutopilotState.ACTIVE
                || !readinessFailures.observe(observed, event)) return;
        for (int attempt = 0; attempt < 3; attempt++) {
            SessionAutopilotRun current = repository.findBySessionId(event.sessionId()).orElse(null);
            if (current == null || current.state() != AutopilotState.ACTIVE
                    || !ReadinessFailureGuard.scope(current).equals(ReadinessFailureGuard.scope(observed))) return;
            String reason = "READINESS_REPEAT_BLOCKED：同一任务的 " + event.toolName()
                    + " 连续两次返回相同前置校验失败，已停止自动续跑。"
                    + "请查看该工具失败记录，修复配置或执行绑定后点击恢复。";
            SessionAutopilotRun blocked = evolve(current, AutopilotState.WAITING_USER, reason,
                    current.context(), current.turnCount(), current.noProgressCount(), current.completedTasks(),
                    current.totalTasks(), false, Instant.now());
            if (repository.update(blocked, current.context().version())) {
                queuedMessages.clearInternal(current.sessionId());
                publish(blocked);
                return;
            }
        }
        LOGGER.warn("[autopilot] 重复前置失败状态写入冲突 session={}", event.sessionId());
    }

    boolean runtimeReadyForContinuation(SessionAutopilotRun run, Instant now) {
        var decision = runtimeStates.canStartTurn(run.sessionId());
        String scope = run.id() + ":" + run.context().generation();
        if (runtimeProbeFailures.observe(scope, decision.code(), now)) {
            String reason = "RUNTIME_STATE_UNAVAILABLE：运行链路连续至少 60 秒、3 次巡检无法确认状态（"
                    + decision.code() + "：" + decision.reason() + "）。已暂停自动派发；"
                    + "原会话、代码和执行进程保留。恢复 Sidecar 连接后点击恢复，后台确认状态后再续跑。";
            SessionAutopilotRun paused = evolve(run, AutopilotState.PAUSED, reason, run.context(),
                    run.turnCount(), run.noProgressCount(), run.completedTasks(), run.totalTasks(),
                    false, Instant.now());
            if (repository.update(paused, run.context().version())) {
                queuedMessages.clearInternal(run.sessionId());
                publish(paused);
            }
            return false;
        }
        return decision.allowed();
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
            int capacityRetries = capacityRetryCount(run.reason());
            if (transientCapacityFailure(event) && capacityRetries < MAX_CAPACITY_RETRIES
                    && run.budgetAvailable(Instant.now())) {
                finishDecision(run, event, turnId, AutopilotState.ACTIVE,
                        CAPACITY_RETRY_REASON + "（" + (capacityRetries + 1) + "/"
                                + MAX_CAPACITY_RETRIES + "）；下一轮先核对已有工作，再继续执行",
                        run.context(), run.noProgressCount());
                return;
            }
            finishDecision(run, event, turnId, AutopilotState.PAUSED,
                    transientCapacityFailure(event) ? "模型容量错误连续出现，已达到后台重试上限"
                            : "上一轮未形成可安全续跑的成功终态",
                    run.context(), run.noProgressCount());
            return;
        }
        if (!run.budgetAvailable(Instant.now())) {
            finishDecision(run, event, turnId, AutopilotState.PAUSED,
                    "自动监督已达到轮次或时间预算", run.context(), run.noProgressCount());
            return;
        }
        if (run.latestDisposition() == AutopilotDisposition.WAITING_USER
                || run.latestDisposition() == AutopilotDisposition.BLOCKED) {
            if (deferBlockedBatchItem(run, turnId)) return;
            finishDecision(run, event, turnId, AutopilotState.WAITING_USER,
                    reportReason(run), run.context(), run.noProgressCount());
            return;
        }
        try {
            ChangeSnapshot snapshot = openSpec.inspect(Path.of(run.context().projectRoot()),
                    run.context().changeId());
            Decision decision = continuousRunner.decide(run, snapshot);
            if ("PRODUCTION_HANDOFF_REQUIRED".equals(decision.code())
                    && deferBatchItem(run, turnId, decision.reason(), true)) {
                return;
            }
            if (!repository.appendStep(new AutopilotStep(run.id(), run.context().generation(), turnId,
                    decision.messageId(), run.context().phase(), run.context().currentTaskId(), decision.code(),
                    boundedText(run.latestSummary()), boundedText(run.latestEvidenceJson()),
                    decision.progressFingerprint(), Instant.now()))) {
                return;
            }
            SessionAutopilotRun next = evolve(run, decision.state(), decision.reason(), decision.context(),
                    run.turnCount() + 1, decision.noProgressCount(), snapshot.completedTasks(), snapshot.totalTasks(),
                    true, Instant.now());
            ChangeSnapshot dispatchSnapshot = snapshot;
            var batch = (decision.state() == AutopilotState.COMPLETED || "DEVELOPER_HANDOFF".equals(decision.code()))
                    ? repository.findBatch(run.sessionId(), run.id()) : Optional.<SessionAutopilotRepository.Batch>empty();
            int nextIndex = -1;
            if (batch.isPresent()) {
                List<String> ids = readList(batch.get().changeIdsJson());
                nextIndex = batch.get().currentIndex() + 1;
                if (nextIndex < ids.size()) {
                    String nextId = ids.get(nextIndex);
                    dispatchSnapshot = openSpec.inspect(Path.of(run.context().projectRoot()), nextId);
                    boolean developer = ProjectExecutionControlStore.disabled(Path.of(run.context().projectRoot()));
                    var validation = developer ? null : openSpec.strictValidate(Path.of(run.context().projectRoot()), nextId);
                    var deferred = repository.findDeferredChanges(run.id()).stream()
                            .filter(item -> item.changeId().equals(nextId)).findFirst();
                    String expectedRevision = readMap(batch.get().expectedRevisionsJson()).get(nextId);
                    boolean revisionMatches = dispatchSnapshot.revision().equals(expectedRevision);
                    boolean ready = (developer || (deferred.isEmpty() && revisionMatches && validation.passed()))
                            && dispatchSnapshot.nextTask() != null;
                    OpenSpecExecutionContext nextContext = new OpenSpecExecutionContext(
                            run.context().projectRoot(), run.context().repositoryIdentity(),
                            run.context().branchAtStart(), run.context().workspaceFingerprint(), nextId,
                            dispatchSnapshot.revision(), ready ? dispatchSnapshot.nextTask().id() : null,
                            ready ? dispatchSnapshot.nextTask().applyOrdinal() : null,
                            OpenSpecExecutionPhase.APPLY, run.context().agentSessionRef(),
                            run.context().generation() + 1, next.context().version() + 1);
                    next = evolve(run, ready ? AutopilotState.ACTIVE : AutopilotState.WAITING_USER,
                            ready ? (developer ? "上一规格开发推进结束（未验证），开始下一规格 " : "上一规格完成，开始下一规格 ") + nextId
                                    : "下一规格 " + nextId + " 需要处理：" + (deferred.isPresent()
                                    ? deferred.get().reason() : !revisionMatches
                                    ? "规格已变化，请核对后恢复" : (developer || validation.passed())
                                    ? "没有待执行 task" : validation.detail()),
                            nextContext, run.turnCount() + 1, 0,
                            dispatchSnapshot.completedTasks(), dispatchSnapshot.totalTasks(), true, Instant.now());
                }
            }
            if (batch.isPresent() && nextIndex >= 0 && next.state() != AutopilotState.COMPLETED) {
                repository.advanceBatch(next, run.context().version(), batch.get().currentIndex());
            } else {
                persist(run, next);
            }
            publish(next);
            if (next.state() == AutopilotState.ACTIVE) {
                queueContinuation(next, dispatchSnapshot, next.reason());
            }
        } catch (RuntimeException exception) {
            if (run.context().phase() == OpenSpecExecutionPhase.ARCHIVE
                    && openSpec.isArchived(Path.of(run.context().projectRoot()),
                    run.context().repositoryIdentity(), run.context().changeId())) {
                var batch = repository.findBatch(run.sessionId(), run.id());
                if (batch.isPresent()) {
                    List<String> ids = readList(batch.get().changeIdsJson());
                    int nextIndex = batch.get().currentIndex() + 1;
                    if (nextIndex < ids.size()) {
                        String nextId = ids.get(nextIndex);
                        OpenSpecExecutionContext nextContext = new OpenSpecExecutionContext(
                                run.context().projectRoot(), run.context().repositoryIdentity(),
                                run.context().branchAtStart(), run.context().workspaceFingerprint(),
                                nextId, "", null, null, OpenSpecExecutionPhase.APPLY,
                                run.context().agentSessionRef(), run.context().generation() + 1,
                                run.context().version() + 1);
                        if (!repository.appendStep(new AutopilotStep(run.id(), run.context().generation(), turnId,
                                null, run.context().phase(), run.context().currentTaskId(), "BATCH_NEXT_WAITING",
                                "上一规格已归档，下一规格等待重新预检", run.latestEvidenceJson(),
                                progressFingerprint(run), Instant.now()))) return;
                        SessionAutopilotRun waiting = evolve(run, AutopilotState.WAITING_USER,
                                "上一规格已归档；下一规格 " + nextId + " 需要重新预检："
                                        + boundedText(exception.getMessage()), nextContext,
                                run.turnCount() + 1, 0, 0, 0, true, Instant.now());
                        repository.advanceBatch(waiting, run.context().version(), batch.get().currentIndex());
                        publish(waiting);
                        return;
                    }
                }
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

    private boolean deferBlockedBatchItem(SessionAutopilotRun run, String turnId) {
        return deferBatchItem(run, turnId, reportReason(run), false);
    }

    private boolean deferBatchItem(SessionAutopilotRun run, String turnId, String blocker,
                                   boolean manualHandoff) {
        try {
            var batch = repository.findBatch(run.sessionId(), run.id());
            if (batch.isEmpty()) return false;
            var previous = repository.findDeferredChanges(run.id());
            var plan = manualHandoff
                    ? batchDeferrals.afterManualHandoff(run, batch.get(), previous, blocker)
                    : batchDeferrals.plan(run, batch.get(), previous, blocker);
            if (plan.isEmpty()) return false;
            var chosen = plan.get();
            String reason = "规格 " + run.context().changeId()
                    + (manualHandoff ? " 的人工项已后置；重新核对旧阻塞并继续 " : " 的问题已暂留，继续 ")
                    + chosen.context().changeId();
            SessionAutopilotRun next = evolve(run, AutopilotState.ACTIVE, reason, chosen.context(),
                    run.turnCount() + 1, 0, chosen.nextSnapshot().completedTasks(),
                    chosen.nextSnapshot().totalTasks(), true, Instant.now());
            AutopilotStep step = new AutopilotStep(run.id(), run.context().generation(), turnId,
                    "autopilot:" + run.id() + ":defer:" + chosen.context().changeId(),
                    run.context().phase(), run.context().currentTaskId(), "DEFER_BATCH_ITEM",
                    blocker, run.latestEvidenceJson(), progressFingerprint(run), Instant.now());
            if (!repository.deferBatch(step, next, run.context().version(), batch.get(),
                    chosen.reorderedChangeIdsJson(), chosen.deferred())) return true;
            repository.clearDeferredChange(run.id(), chosen.context().changeId());
            publish(next);
            queueContinuation(next, chosen.nextSnapshot(), reason);
            return true;
        } catch (RuntimeException exception) {
            LOGGER.warn("[autopilot] 批次暂留失败 session={}", run.sessionId(), exception);
            return false;
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
        SessionAutopilotRun next = evolve(run, state, reason, context, Math.min(run.maxTurns(), run.turnCount() + 1),
                noProgress, run.completedTasks(), run.totalTasks(), true, Instant.now());
        if (repository.update(next, run.context().version())) {
            publish(next);
        }
    }

    private SessionAutopilotRun resume(SessionAutopilotRun run, Instant now) {
        return resume(run, now, false);
    }

    private SessionAutopilotRun resume(SessionAutopilotRun run, Instant now, boolean resetBudget) {
        if (resetBudget && (run.state() == AutopilotState.COMPLETED || run.state() == AutopilotState.STOPPED)) {
            throw new IllegalArgumentException("已结束的监督不能重置预算，请新建监督运行");
        }
        if (!resetBudget && run.turnCount() >= run.maxTurns()) {
            throw new IllegalArgumentException("轮次预算已耗尽，请选择重置轮次并继续");
        }
        int turns = resetBudget ? 0 : run.turnCount();
        ProvisioningResult skill = skillProvisioner.provision(Path.of(run.context().projectRoot()));
        if (!skill.ready()) {
            throw new IllegalStateException("Continuous Execution Skill 名称与用户文件冲突："
                    + String.join("、", skill.collisions()));
        }
        String skillPaths = String.join(",", skill.installedPaths());
        if (archiveConfirmed(run)) {
            OpenSpecExecutionContext context = new OpenSpecExecutionContext(
                    run.context().projectRoot(), run.context().repositoryIdentity(), run.context().branchAtStart(),
                    run.context().workspaceFingerprint(), run.context().changeId(), run.context().changeRevision(),
                    null, null, OpenSpecExecutionPhase.ARCHIVE, run.context().agentSessionRef(),
                    run.context().generation() + 1, run.context().version() + 1);
            Instant deadline = !resetBudget && run.deadlineAt().isAfter(now) ? run.deadlineAt() : now.plus(DEFAULT_DEADLINE);
            return new SessionAutopilotRun(run.id(), run.sessionId(), run.goal(), run.completionPolicy(),
                    AutopilotState.ACTIVE, "已发现 OpenSpec 归档，等待当前轮次完成确认", context,
                    turns, run.maxTurns(), 0, run.maxNoProgress(), run.autoArchive(),
                    false, skillPaths, skill.version(), skill.fingerprint(), true,
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
        Instant deadline = !resetBudget && run.deadlineAt().isAfter(now) ? run.deadlineAt() : now.plus(DEFAULT_DEADLINE);
        return new SessionAutopilotRun(run.id(), run.sessionId(), run.goal(), run.completionPolicy(),
                AutopilotState.ACTIVE, resetBudget ? "用户重置预算并继续监督，已完成任务保留" : "用户恢复自动监督", context, turns, run.maxTurns(), 0,
                run.maxNoProgress(), run.autoArchive(), false, skillPaths, skill.version(),
                skill.fingerprint(), true, snapshot.completedTasks(), snapshot.totalTasks(), null, null, null,
                null, null, null, run.startedAt(), deadline, now);
    }

    private boolean archiveConfirmed(SessionAutopilotRun run) {
        return (run.context().phase() == OpenSpecExecutionPhase.ARCHIVE
                || run.context().phase() == OpenSpecExecutionPhase.DONE)
                && openSpec.isArchived(Path.of(run.context().projectRoot()),
                run.context().repositoryIdentity(), run.context().changeId());
    }

    private void queueContinuation(SessionAutopilotRun run, ChangeSnapshot snapshot, String reason) {
        if (!run.budgetAvailable(Instant.now())) {
            pauseForBudget(run);
            return;
        }
        AutopilotTurnHandoff.Message handoff = AutopilotTurnHandoff.forRun(run, snapshot, reason);
        queuedMessages.saveInternal(run.sessionId(), handoff.id(), handoff.text(), handoff.display(),
                handoff.instructions(),
                System.currentTimeMillis());
        // 前置结果可能在旧调度快照生成后阻塞运行；派发前再次核对，不能重新留下续跑消息。
        SessionAutopilotRun latest = repository.findBySessionId(run.sessionId()).orElse(null);
        if (latest == null || latest.state() != AutopilotState.ACTIVE
                || latest.context().generation() != run.context().generation()) {
            queuedMessages.delete(run.sessionId(), handoff.id());
            return;
        }
        events.publishEvent(new SessionQueueReleaseRequestedEvent(run.sessionId()));
    }

    private void pauseForBudget(SessionAutopilotRun run) {
        Instant now = Instant.now();
        String reason = run.turnCount() >= run.maxTurns()
                ? "TURN_LIMIT_REACHED：轮次预算已耗尽，可重置轮次并继续"
                : "TIME_LIMIT_REACHED：运行时间预算已耗尽，可重置预算并继续";
        SessionAutopilotRun paused = evolve(run, AutopilotState.PAUSED, reason, run.context(),
                run.turnCount(), run.noProgressCount(), run.completedTasks(), run.totalTasks(), false, now);
        if (repository.update(paused, run.context().version())) {
            queuedMessages.clearInternal(run.sessionId());
            publish(paused);
        }
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

    private String writeMap(Map<String, String> values) {
        try {
            return objectMapper.writeValueAsString(values == null ? Map.of() : values);
        } catch (Exception exception) {
            throw new IllegalArgumentException("规格修订无法序列化", exception);
        }
    }

    private Map<String, String> readMap(String json) {
        try {
            return objectMapper.readValue(json, STRING_MAP);
        } catch (Exception exception) {
            return Map.of();
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

    private boolean transientCapacityFailure(SessionTurnSettledEvent event) {
        boolean failed = "failed".equalsIgnoreCase(event.stopReason())
                || "error".equalsIgnoreCase(event.stopReason());
        return failed && event.errorCode() != null
                && event.errorCode().startsWith("CODEX_APP_SERVER_")
                && event.errorMessage() != null
                && event.errorMessage().toLowerCase(java.util.Locale.ROOT).contains("at capacity");
    }

    private int capacityRetryCount(String reason) {
        if (reason == null || !reason.startsWith(CAPACITY_RETRY_REASON)) return 0;
        int marker = reason.indexOf('（', CAPACITY_RETRY_REASON.length());
        int slash = reason.indexOf('/', marker + 1);
        if (marker < 0 || slash < 0) return 0;
        try {
            return Integer.parseInt(reason.substring(marker + 1, slash));
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    private String reportReason(SessionAutopilotRun run) {
        return run.reason() == null || run.reason().isBlank() ? "Agent 报告需要用户处理" : run.reason();
    }

    private List<AutopilotState> statesForScope(String scope) {
        return switch (scope == null ? "active" : scope.toLowerCase()) {
            case "all" -> List.of(AutopilotState.ACTIVE, AutopilotState.WAITING_USER,
                    AutopilotState.FAILED, AutopilotState.PAUSED, AutopilotState.COMPLETED,
                    AutopilotState.STOPPED);
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
                               Integer maxTurns, Integer maxNoProgress, Integer deadlineMinutes,
                               String expectedRevision, List<String> changeIds,
                               Map<String, String> expectedRevisions) {
        public StartRequest(String projectRoot, String changeId, String goal, boolean autoArchive,
                            Integer maxTurns, Integer maxNoProgress, Integer deadlineMinutes,
                            String expectedRevision) {
            this(projectRoot, changeId, goal, autoArchive, maxTurns, maxNoProgress, deadlineMinutes,
                    expectedRevision, null, null);
        }
    }

    public record BatchView(List<String> changeIds, int currentIndex,
                            List<SessionAutopilotRepository.DeferredChange> deferred) { }

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
