package com.exceptioncoder.toolbox.system;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 统一协调手动重启与自动更新后的 JVM 外交接。
 *
 * <p>成功的定义不是“已经调用 System.exit”，而是 supervisor 已确认 full-reload，或 replacement
 * JVM 已写入带 nonce 的端口接管等待握手。该握手不代表 Spring 已完成运行期健康检查；任何
 * 预检/握手失败都会保留当前服务。
 */
@Component
public class RestartCoordinator {

    private static final Logger log = LoggerFactory.getLogger(RestartCoordinator.class);

    private final RestartRuntime runtime;
    private final SupervisorControlClient supervisor;
    private final CandidateHandoffLauncher handoff;
    private final RestartShutdown shutdown;
    private final List<String> sourceApplicationArgs;
    private final AtomicBoolean restarting = new AtomicBoolean(false);

    public RestartCoordinator(RestartRuntime runtime,
                              SupervisorControlClient supervisor,
                              CandidateHandoffLauncher handoff,
                              RestartShutdown shutdown,
                              ApplicationArguments applicationArguments) {
        this.runtime = runtime;
        this.supervisor = supervisor;
        this.handoff = handoff;
        this.shutdown = shutdown;
        this.sourceApplicationArgs = Arrays.asList(applicationArguments.getSourceArgs().clone());
    }

    /**
     * 自动更新合并前预检。此方法无副作用，不会发 full-reload，也不会启动 replacement JVM。
     */
    public RestartOutcome preflightAfterUpdate(Path stagedJar, Path repoRoot) {
        if (repoRoot == null) {
            return RestartOutcome.rejected(Failure.INVALID_REPOSITORY, "缺少待更新仓库目录");
        }
        try {
            return preflightAfterUpdate(stagedJar, repoRoot, isExternallySupervised());
        } catch (RuntimeException e) {
            log.warn("[restart] 更新交接预检异常：{}", e.getMessage());
            return RestartOutcome.rejected(Failure.HANDOFF_FAILED, "更新交接预检失败");
        }
    }

    /**
     * 从“合并前最终预检”开始原子占用重启通道，避免手动重启在 Git merge 与 replacement
     * 交接之间插队。调用方应使用 try-with-resources；未提交时 close 会释放占用。
     */
    public RestartReservation reserveAfterUpdate(Path stagedJar, Path repoRoot) {
        if (!restarting.compareAndSet(false, true)) {
            return new RestartReservation(null, null, false,
                    RestartOutcome.rejected(Failure.ALREADY_RESTARTING, "已有重启交接正在进行"), false);
        }
        boolean externallySupervised = isExternallySupervised();
        RestartOutcome preflight;
        try {
            preflight = preflightAfterUpdate(stagedJar, repoRoot, externallySupervised);
        } catch (RuntimeException e) {
            log.warn("[restart] 更新交接 reservation 预检异常：{}", e.getMessage());
            preflight = RestartOutcome.rejected(Failure.HANDOFF_FAILED, "更新交接预检失败");
        }
        if (!preflight.accepted()) {
            restarting.set(false);
            return new RestartReservation(null, null, externallySupervised, preflight, false);
        }
        return new RestartReservation(stagedJar, repoRoot, externallySupervised, preflight, true);
    }

    /**
     * 自动更新完成后的唯一重启入口。supervisor 模式请求全栈 reload；直启模式交接到 staged fat jar。
     */
    public RestartOutcome restartAfterUpdate(Path stagedJar, Path repoRoot) {
        if (!restarting.compareAndSet(false, true)) {
            return RestartOutcome.rejected(Failure.ALREADY_RESTARTING, "已有重启交接正在进行");
        }
        try {
            RestartOutcome outcome = performAfterUpdate(stagedJar, repoRoot, isExternallySupervised(),
                    ignored -> { }, () -> restarting.set(false));
            if (!outcome.accepted()) {
                restarting.set(false);
            }
            return outcome;
        } catch (RuntimeException e) {
            restarting.set(false);
            log.warn("[restart] 自动更新重启交接异常：{}", e.getMessage());
            return RestartOutcome.rejected(Failure.HANDOFF_FAILED, "自动更新重启交接失败，当前服务继续运行");
        }
    }

    /** 手动重启：无候选版本时仅允许重启当前可执行 fat jar，IDE classes 模式会安全拒绝。 */
    public RestartOutcome restartCurrent() {
        if (!restarting.compareAndSet(false, true)) {
            return RestartOutcome.rejected(Failure.ALREADY_RESTARTING, "已有重启交接正在进行");
        }
        try {
            Path repoRoot = runtime.repositoryRoot().orElseGet(runtime::workingDirectory);
            if (isExternallySupervised()) {
                RestartOutcome outcome = supervisor.requestFullReload(repoRoot);
                if (!outcome.accepted()) restarting.set(false);
                return outcome;
            }
            var currentJar = runtime.currentExecutableJar();
            if (currentJar.isEmpty()) {
                restarting.set(false);
                return RestartOutcome.rejected(Failure.CURRENT_JAR_UNAVAILABLE,
                        "当前不是可执行 fat-jar 启动，且没有外部 supervisor，已拒绝退出");
            }
            CandidateHandoffLauncher.Launch launch = handoff.launchCurrent(currentJar.get(), runtime.workingDirectory(),
                    sourceApplicationArgs);
            if (!launch.outcome().accepted()) {
                restarting.set(false);
                return launch.outcome();
            }
            try {
                shutdown.afterResponse(launch.process(), () -> restarting.set(false));
            } catch (RuntimeException e) {
                handoff.cancel(launch);
                restarting.set(false);
                log.warn("[restart] 无法排程旧 JVM 退出：{}", e.getMessage());
                return RestartOutcome.rejected(Failure.HANDOFF_FAILED,
                        "无法排程旧 JVM 退出，当前服务继续运行");
            }
            return launch.outcome();
        } catch (RuntimeException e) {
            restarting.set(false);
            log.warn("[restart] 手动重启交接异常：{}", e.getMessage());
            return RestartOutcome.rejected(Failure.HANDOFF_FAILED, "重启交接失败，当前服务继续运行");
        }
    }

    public boolean isExternallySupervised() {
        return runtime.isExternallySupervised();
    }

    private RestartOutcome preflightAfterUpdate(Path stagedJar, Path repoRoot, boolean externallySupervised) {
        if (repoRoot == null) {
            return RestartOutcome.rejected(Failure.INVALID_REPOSITORY, "缺少待更新仓库目录");
        }
        return externallySupervised ? supervisor.preflight(repoRoot) : handoff.preflight(stagedJar, repoRoot);
    }

    private RestartOutcome performAfterUpdate(Path stagedJar, Path repoRoot, boolean externallySupervised,
                                              java.util.function.Consumer<CandidateHandoffLauncher.Launch> onLaunch,
                                              Runnable onAsyncFailure) {
        if (externallySupervised) {
            return supervisor.requestFullReload(repoRoot);
        }
        CandidateHandoffLauncher.Launch launch = handoff.launch(stagedJar, repoRoot, sourceApplicationArgs);
        if (!launch.outcome().accepted()) return launch.outcome();
        onLaunch.accept(launch);
        try {
            shutdown.afterResponse(launch.process(), onAsyncFailure);
            return launch.outcome();
        } catch (RuntimeException e) {
            handoff.cancel(launch);
            log.warn("[restart] 无法排程旧 JVM 退出：{}", e.getMessage());
            return RestartOutcome.rejected(Failure.HANDOFF_FAILED,
                    "replacement JVM 已进入接管等待，但无法排程旧 JVM 退出");
        }
    }

    public final class RestartReservation implements AutoCloseable {

        private final Path stagedJar;
        private final Path repoRoot;
        private final boolean externallySupervised;
        private final AtomicReference<ReservationState> state;
        private final CompletableFuture<RestartOutcome> failureSignal = new CompletableFuture<>();
        private volatile RestartOutcome currentOutcome;
        private volatile CandidateHandoffLauncher.Launch activeLaunch;

        private RestartReservation(Path stagedJar, Path repoRoot, boolean externallySupervised,
                                   RestartOutcome outcome, boolean held) {
            this.stagedJar = stagedJar;
            this.repoRoot = repoRoot;
            this.externallySupervised = externallySupervised;
            this.currentOutcome = outcome;
            this.state = new AtomicReference<>(held ? ReservationState.RESERVED : ReservationState.RELEASED);
        }

        public RestartOutcome outcome() {
            return currentOutcome;
        }

        public boolean accepted() {
            return currentOutcome.accepted() && state.get() != ReservationState.RELEASED;
        }

        public CompletionStage<RestartOutcome> failureSignal() {
            return failureSignal;
        }

        public RestartOutcome restartAfterUpdate() {
            if (!state.compareAndSet(ReservationState.RESERVED, ReservationState.STARTING)) {
                return RestartOutcome.rejected(Failure.ALREADY_RESTARTING,
                        "更新重启 reservation 已提交、释放或废弃");
            }
            RestartOutcome result;
            try {
                result = performAfterUpdate(stagedJar, repoRoot, externallySupervised,
                        launch -> activeLaunch = launch, this::asyncFailure);
            } catch (RuntimeException e) {
                log.warn("[restart] reservation 重启交接异常：{}", e.getMessage());
                result = RestartOutcome.rejected(Failure.HANDOFF_FAILED,
                        "自动更新重启交接失败，当前服务继续运行");
            }
            if (result.accepted()) {
                if (state.compareAndSet(ReservationState.STARTING, ReservationState.COMMITTED)) {
                    currentOutcome = result;
                } else {
                    return currentOutcome;
                }
            } else {
                currentOutcome = result;
                state.set(ReservationState.RELEASED);
                restarting.set(false);
                CandidateHandoffLauncher.Launch launch = activeLaunch;
                if (launch != null) handoff.cancel(launch);
                activeLaunch = null;
            }
            return result;
        }

        /** watchdog 显式放弃接管；与成功后的普通 close 语义不同。 */
        public void abandon() {
            ReservationState previous = state.getAndSet(ReservationState.ABANDONED);
            if (previous == ReservationState.ABANDONED || previous == ReservationState.RELEASED) return;
            CandidateHandoffLauncher.Launch launch = activeLaunch;
            if (launch != null) handoff.cancel(launch);
            activeLaunch = null;
            restarting.set(false);
            RestartOutcome failure = RestartOutcome.rejected(Failure.HANDOFF_FAILED,
                    "重启接管被 watchdog 放弃，当前服务继续运行");
            currentOutcome = failure;
            failureSignal.complete(failure);
        }

        /** 未提交的 reservation 自动释放；已成功提交的接管保持占用，直到 JVM 退出或 abandon。 */
        @Override
        public void close() {
            if (state.compareAndSet(ReservationState.RESERVED, ReservationState.RELEASED)) {
                restarting.set(false);
            }
        }

        private void asyncFailure() {
            ReservationState previous = state.getAndSet(ReservationState.RELEASED);
            if (previous == ReservationState.ABANDONED || previous == ReservationState.RELEASED) return;
            activeLaunch = null;
            restarting.set(false);
            RestartOutcome failure = RestartOutcome.rejected(Failure.HANDOFF_FAILED,
                    "replacement JVM 在旧服务退出前消失，当前服务继续运行");
            currentOutcome = failure;
            failureSignal.complete(failure);
        }
    }

    private enum ReservationState {
        RESERVED,
        STARTING,
        COMMITTED,
        RELEASED,
        ABANDONED
    }

    public enum Failure {
        NONE,
        ALREADY_RESTARTING,
        INVALID_REPOSITORY,
        INVALID_CANDIDATE,
        CURRENT_JAR_UNAVAILABLE,
        JAVA_UNAVAILABLE,
        SUPERVISOR_UNAVAILABLE,
        SUPERVISOR_INCOMPATIBLE,
        SUPERVISOR_TOKEN_UNAVAILABLE,
        HANDOFF_FAILED
    }

    public record RestartOutcome(boolean accepted, Failure failure, String message) {
        public RestartOutcome {
            if (failure == null) failure = Failure.HANDOFF_FAILED;
            if (message == null || message.isBlank()) message = accepted ? "重启已接受" : "重启被拒绝";
            if (accepted) failure = Failure.NONE;
        }

        public static RestartOutcome accepted(String message) {
            return new RestartOutcome(true, Failure.NONE, message);
        }

        public static RestartOutcome rejected(Failure failure, String message) {
            return new RestartOutcome(false, failure, message);
        }
    }
}
