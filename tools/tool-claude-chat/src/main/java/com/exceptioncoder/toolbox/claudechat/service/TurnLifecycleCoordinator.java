package com.exceptioncoder.toolbox.claudechat.service;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 持久会话轮次的相关性与中断超时协调器。
 * 只管理内存协议状态，不读写会话数据库，也不感知具体 Agent 引擎。
 */
final class TurnLifecycleCoordinator implements AutoCloseable {

    private static final Duration DEFAULT_QUERY_DELAY = Duration.ofSeconds(3);
    private static final Duration DEFAULT_FORCE_CLOSE_DELAY = Duration.ofSeconds(5);

    private final ConcurrentHashMap<String, TurnState> turns = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler;
    private final Duration queryDelay;
    private final Duration forceCloseDelay;

    TurnLifecycleCoordinator() {
        this(DEFAULT_QUERY_DELAY, DEFAULT_FORCE_CLOSE_DELAY);
    }

    TurnLifecycleCoordinator(Duration queryDelay, Duration forceCloseDelay) {
        this.queryDelay = queryDelay;
        this.forceCloseDelay = forceCloseDelay;
        this.scheduler = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon().name("claude-chat-turn-reconcile").factory());
    }

    String begin(String sessionId) {
        return adopt(sessionId, UUID.randomUUID().toString());
    }

    String adopt(String sessionId, String turnId) {
        TurnState previous = turns.put(sessionId, new TurnState(turnId));
        if (previous != null) previous.cancelTimers();
        return turnId;
    }

    Optional<String> currentTurnId(String sessionId) {
        TurnState state = turns.get(sessionId);
        return state == null ? Optional.empty() : Optional.of(state.turnId);
    }

    boolean requestInterrupt(String sessionId, String turnId, Runnable queryAction, Runnable forceCloseAction) {
        TurnState state = turns.get(sessionId);
        if (state == null || !state.turnId.equals(turnId)) return false;
        if (!state.interrupting.compareAndSet(false, true)) return false;
        state.queryTask = scheduler.schedule(
                () -> runIfCurrent(sessionId, state, queryAction),
                queryDelay.toMillis(), TimeUnit.MILLISECONDS);
        state.forceCloseTask = scheduler.schedule(
                () -> runIfCurrent(sessionId, state, forceCloseAction),
                forceCloseDelay.toMillis(), TimeUnit.MILLISECONDS);
        return true;
    }

    boolean isInterrupting(String sessionId, String turnId) {
        TurnState state = turns.get(sessionId);
        return state != null && state.turnId.equals(turnId) && state.interrupting.get();
    }

    boolean matchesCurrent(String sessionId, String eventTurnId) {
        TurnState state = turns.get(sessionId);
        if (state == null) return eventTurnId == null || eventTurnId.isBlank();
        return eventTurnId == null || eventTurnId.isBlank() || state.turnId.equals(eventTurnId);
    }

    /**
     * 匹配并移除当前轮。旧 Sidecar 不带 turnId 时仅兼容当前唯一活动轮，带 turnId 时严格拒绝迟到终态。
     */
    boolean complete(String sessionId, String eventTurnId) {
        TurnState state = turns.get(sessionId);
        if (state == null) return eventTurnId == null || eventTurnId.isBlank();
        if (eventTurnId != null && !eventTurnId.isBlank() && !state.turnId.equals(eventTurnId)) return false;
        if (!turns.remove(sessionId, state)) return false;
        state.cancelTimers();
        return true;
    }

    void clear(String sessionId) {
        TurnState state = turns.remove(sessionId);
        if (state != null) state.cancelTimers();
    }

    private void runIfCurrent(String sessionId, TurnState expected, Runnable action) {
        if (turns.get(sessionId) == expected && expected.interrupting.get()) action.run();
    }

    @Override
    public void close() {
        turns.values().forEach(TurnState::cancelTimers);
        turns.clear();
        scheduler.shutdownNow();
    }

    private static final class TurnState {
        private final String turnId;
        private final AtomicBoolean interrupting = new AtomicBoolean(false);
        private volatile ScheduledFuture<?> queryTask;
        private volatile ScheduledFuture<?> forceCloseTask;

        private TurnState(String turnId) {
            this.turnId = turnId;
        }

        private void cancelTimers() {
            if (queryTask != null) queryTask.cancel(false);
            if (forceCloseTask != null) forceCloseTask.cancel(false);
        }
    }
}
