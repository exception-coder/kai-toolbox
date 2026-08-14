package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.SessionRuntimeStateView;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/** 聚合Java、SQLite、Sidecar及Agent观察值，生成会话唯一有效状态。 */
@Service
public class SessionRuntimeStateService {

    static final long SIDECAR_QUERY_TIMEOUT_MS = 1_500L;
    static final long SNAPSHOT_STALE_MS = Duration.ofSeconds(10).toMillis();

    private final ClaudeChatSessionRepository repository;
    private final SidecarClient sidecar;
    private final ConcurrentHashMap<String, BackendObservation> backendObservations = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, SidecarObservation> sidecarObservations = new ConcurrentHashMap<>();

    public SessionRuntimeStateService(ClaudeChatSessionRepository repository, SidecarClient sidecar) {
        this.repository = repository;
        this.sidecar = sidecar;
    }

    /** 更新Java内存侧观察值；调用方只上报事实，不在此处触发状态迁移。 */
    public void observeBackend(String sessionId, SessionStatus status, String activeTurnId,
                               boolean pendingDecision, int backgroundTaskCount, int viewerCount) {
        backendObservations.put(sessionId, new BackendObservation(
                status, activeTurnId, pendingDecision, backgroundTaskCount, viewerCount, System.currentTimeMillis()));
    }

    /** 清理已销毁会话的内存观察值。 */
    public void forget(String sessionId) {
        backendObservations.remove(sessionId);
        sidecarObservations.remove(sessionId);
    }

    /** 记录Sidecar已完成整轮清理后发出的终态事实，供同一回调中的队列门禁无阻塞使用。 */
    public void observeSidecarTerminal(String sessionId, int backgroundTaskCount) {
        sidecarObservations.put(sessionId, new SidecarObservation(
                true, false, false, backgroundTaskCount, null, null, "idle", System.currentTimeMillis()));
    }

    /** 更新Sidecar后台任务计数，同时保留最近一次轮次状态。 */
    public void observeSidecarBackgroundTasks(String sessionId, int backgroundTaskCount) {
        sidecarObservations.computeIfPresent(sessionId, (ignored, state) -> new SidecarObservation(
                state.sessionPresent(), state.active(), state.pendingDecision(), backgroundTaskCount,
                state.activeTurnId(), state.phase(), state.agentState(), System.currentTimeMillis()));
    }

    /** 查询并聚合指定会话状态；Sidecar无法响应时返回UNKNOWN，不使用旧值伪装空闲。 */
    public Optional<SessionRuntimeStateView> inspect(String sessionId) {
        Optional<ClaudeChatSession> stored = repository.findById(sessionId);
        if (stored.isEmpty()) {
            return Optional.empty();
        }
        BackendObservation backend = backendObservations.get(sessionId);
        boolean connected = sidecar.isConnected();
        SidecarObservation sidecarState = connected
                ? sidecar.querySessionState(sessionId, backend == null ? null : backend.activeTurnId(),
                        SIDECAR_QUERY_TIMEOUT_MS).map(SidecarObservation::from).orElse(null)
                : null;
        if (sidecarState != null) {
            sidecarObservations.put(sessionId, sidecarState);
        }
        return Optional.of(assess(stored.get(), backend, connected, sidecarState, System.currentTimeMillis()));
    }

    /** 发送前的确定性门禁，避免Java空闲但Sidecar仍有活动轮次时串轮。 */
    public SendDecision canStartTurn(String sessionId) {
        Optional<SessionRuntimeStateView> snapshot = inspect(sessionId);
        if (snapshot.isEmpty()) {
            return new SendDecision(false, "SESSION_NOT_FOUND", "会话不存在");
        }
        SessionRuntimeStateView state = snapshot.get();
        return new SendDecision(state.canSend(), state.consistency(), state.reason());
    }

    /** 使用刚收到的Sidecar终态快照判断队列释放，禁止在Sidecar消息回调线程内发起同步反查。 */
    public SendDecision canReleaseQueue(String sessionId) {
        Optional<ClaudeChatSession> stored = repository.findById(sessionId);
        if (stored.isEmpty()) {
            return new SendDecision(false, "SESSION_NOT_FOUND", "会话不存在");
        }
        BackendObservation backend = backendObservations.get(sessionId);
        SidecarObservation sidecarState = sidecarObservations.get(sessionId);
        SessionRuntimeStateView state = assess(
                stored.get(), backend, sidecar.isConnected(), sidecarState, System.currentTimeMillis());
        return new SendDecision(state.canSend(), state.consistency(), state.reason());
    }

    static SessionRuntimeStateView assess(ClaudeChatSession stored, BackendObservation backend,
                                          boolean connected, SidecarObservation sidecarState, long now) {
        String persisted = stored.getStatus().name();
        String backendStatus = backend == null ? null : backend.status().name();
        boolean browserConnected = backend != null && backend.viewerCount() > 0;
        if (!connected || sidecarState == null) {
            String effective = SessionStatus.RUNNING.name().equals(backendStatus) ? "RECONNECTING" : "UNKNOWN";
            return new SessionRuntimeStateView(stored.getId(), effective, "SIDECAR_UNREACHABLE",
                    persisted, backendStatus, browserConnected, connected,
                    null, null, null, null, backend == null ? null : backend.activeTurnId(),
                    null, "unknown", null, now, true, false, true,
                    SessionStatus.RUNNING.name().equals(backendStatus),
                    "Sidecar状态不可确认，不能判定会话空闲", "等待重连后重新核对状态");
        }

        boolean stale = now - sidecarState.lastHeartbeatAt() > SNAPSHOT_STALE_MS;
        String consistency = consistency(persisted, backend, sidecarState, stale);
        String effective = effectiveStatus(stored.getStatus(), sidecarState);
        boolean canSend = !stale && "CONSISTENT".equals(consistency)
                && backend != null && backend.status() == SessionStatus.IDLE
                && sidecarState.sessionPresent() && !sidecarState.active()
                && !sidecarState.pendingDecision() && sidecarState.backgroundTaskCount() == 0;
        boolean canInterrupt = sidecarState.active()
                || backend != null && backend.status() == SessionStatus.RUNNING;
        String reason = reason(consistency, effective);
        return new SessionRuntimeStateView(stored.getId(), effective, consistency, persisted, backendStatus,
                browserConnected, true, sidecarState.sessionPresent(), sidecarState.active(),
                sidecarState.pendingDecision(), sidecarState.backgroundTaskCount(), sidecarState.activeTurnId(),
                sidecarState.phase(), sidecarState.agentState(), sidecarState.lastHeartbeatAt(), now, stale,
                canSend, true, canInterrupt, reason, recommendedAction(consistency));
    }

    private static String consistency(String persisted, BackendObservation backend,
                                      SidecarObservation sidecarState, boolean stale) {
        if (stale) {
            return "STALE";
        }
        if (backend == null) {
            return sidecarState.active() ? "BACKEND_STATE_LOST" : "JAVA_CONTEXT_MISSING";
        }
        if (!sidecarState.sessionPresent()) {
            return "SIDECAR_SESSION_MISSING";
        }
        if (sidecarState.active() && backend.activeTurnId() != null && sidecarState.activeTurnId() != null
                && !backend.activeTurnId().equals(sidecarState.activeTurnId())) {
            return "TURN_MISMATCH";
        }
        if (sidecarState.active() && backend.status() != SessionStatus.RUNNING) {
            return "BACKEND_STATE_LOST";
        }
        if (!sidecarState.active() && backend.status() == SessionStatus.RUNNING) {
            return "GHOST_RUNNING";
        }
        if (!persisted.equals(backend.status().name())) {
            return "PERSISTENCE_DRIFT";
        }
        return "CONSISTENT";
    }

    private static String effectiveStatus(SessionStatus persisted, SidecarObservation sidecarState) {
        if (sidecarState.active()) {
            if (sidecarState.pendingDecision()) {
                return "AWAITING_DECISION";
            }
            if ("finalizing".equals(sidecarState.phase()) || "finalizing".equals(sidecarState.agentState())) {
                return "FINALIZING";
            }
            return "RUNNING";
        }
        if (sidecarState.backgroundTaskCount() > 0) {
            return "BACKGROUND_RUNNING";
        }
        if (persisted == SessionStatus.INTERRUPTED) {
            return "INTERRUPTED";
        }
        return "IDLE";
    }

    private static String reason(String consistency, String effective) {
        return switch (consistency) {
            case "GHOST_RUNNING" -> "Java仍标记运行中，但Sidecar已经没有活动轮次";
            case "BACKEND_STATE_LOST" -> "Sidecar仍有活动轮次，但Java没有对应运行状态";
            case "TURN_MISMATCH" -> "Java与Sidecar当前轮次标识不一致";
            case "PERSISTENCE_DRIFT" -> "Java内存状态与SQLite恢复状态不一致";
            case "JAVA_CONTEXT_MISSING" -> "Java内存中尚未挂载该会话";
            case "SIDECAR_SESSION_MISSING" -> "Java已挂载会话，但Sidecar中不存在对应会话";
            case "STALE" -> "Sidecar状态快照已过期";
            default -> "当前全链路状态为" + effective;
        };
    }

    private static String recommendedAction(String consistency) {
        return switch (consistency) {
            case "GHOST_RUNNING" -> "执行幂等终态收口";
            case "BACKEND_STATE_LOST", "TURN_MISMATCH" -> "恢复Sidecar活动轮次并锁定发送";
            case "PERSISTENCE_DRIFT" -> "同步持久化状态";
            case "JAVA_CONTEXT_MISSING" -> "进入会话并恢复上下文";
            case "SIDECAR_SESSION_MISSING" -> "重新向Sidecar恢复会话";
            case "STALE" -> "重新查询Sidecar状态";
            default -> "无需校正";
        };
    }

    /** Java内存层观察值。 */
    record BackendObservation(SessionStatus status, String activeTurnId, boolean pendingDecision,
                              int backgroundTaskCount, int viewerCount, long observedAt) {
    }

    /** Sidecar与Agent适配层观察值。 */
    record SidecarObservation(boolean sessionPresent, boolean active, boolean pendingDecision,
                              int backgroundTaskCount, String activeTurnId, String phase,
                              String agentState, long lastHeartbeatAt) {
        static SidecarObservation from(JsonNode node) {
            return new SidecarObservation(node.path("sessionPresent").asBoolean(false),
                    node.path("active").asBoolean(false), node.path("pendingDecision").asBoolean(false),
                    node.path("backgroundTaskCount").asInt(0), text(node, "activeTurnId"), text(node, "phase"),
                    node.path("agentState").asText("unknown"),
                    node.path("lastHeartbeatAt").asLong(System.currentTimeMillis()));
        }

        private static String text(JsonNode node, String field) {
            String value = node.path(field).asText(null);
            return value == null || value.isBlank() ? null : value;
        }
    }

    /** 发送门禁结果。 */
    public record SendDecision(boolean allowed, String code, String reason) {
    }
}
