package com.exceptioncoder.toolbox.system.update;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeChatActivityView;
import com.exceptioncoder.toolbox.claudechat.service.AgentWorkAdmissionGate;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.exceptioncoder.toolbox.system.RestartCoordinator;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.system.ApplicationHome;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Optional;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.io.Reader;
import java.io.Writer;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

/**
 * Java 进程内的唯一自动更新 owner：定时 fetch、安全分类、候选构建、Agent 排空、不可变 SHA 快进与重启交接。
 * 任一步无法确认都保持旧服务运行；绝不 stash/reset/clean/rebase，也不强杀在途 Agent。
 */
@Service
public class JavaAutoUpdateService {

    private static final Logger log = LoggerFactory.getLogger(JavaAutoUpdateService.class);
    private static final Pattern SHA = Pattern.compile("[0-9a-fA-F]{40,64}");

    private final AutoUpdateProperties properties;
    private final AutoUpdateRepository repository;
    private final AutoUpdateCandidateBuilder candidateBuilder;
    private final RestartCoordinator restartCoordinator;
    private final AgentWorkAdmissionGate admissionGate;
    private final ClaudeChatService claudeChatService;
    private final Path stateDirectory;
    private final Path pendingRestartFile;
    private final String processInstanceId = UUID.randomUUID().toString();
    private final ExecutorService workerExecutor = Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual().name("auto-update-worker-", 0).factory());
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final Object restartStateLock = new Object();

    private volatile boolean shuttingDown;
    private volatile String candidateSha;
    private volatile long candidateFirstSeenAt;
    private volatile int consecutiveFetchFailures;
    private volatile long nextEligibleAt;
    private volatile String failedBuildSha;
    private volatile String failedBuildError;
    private volatile int consecutiveBuildFailures;
    private volatile long buildRetryAt;
    private volatile PendingRestart pendingRestart;
    private volatile AgentWorkAdmissionGate.DrainLease retainedDrain;
    private volatile RestartCoordinator.RestartReservation retainedRestartReservation;

    private volatile String state;
    private volatile String message;
    private volatile String blockedReason;
    private volatile String lastError;
    private volatile String localHead;
    private volatile String remoteHead;
    private volatile Long lastCheck;
    private volatile Long nextCheck;
    private volatile Long lastSuccess;

    public JavaAutoUpdateService(AutoUpdateProperties properties,
                                 AutoUpdateRepository repository,
                                 AutoUpdateCandidateBuilder candidateBuilder,
                                 RestartCoordinator restartCoordinator,
                                 AgentWorkAdmissionGate admissionGate,
                                 ClaudeChatService claudeChatService,
                                 @Value("${toolbox.data-dir:${user.home}/.kai-toolbox}") String dataDir) {
        this.properties = properties;
        this.repository = repository;
        this.candidateBuilder = candidateBuilder;
        this.restartCoordinator = restartCoordinator;
        this.admissionGate = admissionGate;
        this.claudeChatService = claudeChatService;
        this.stateDirectory = Path.of(dataDir).toAbsolutePath().normalize().resolve("auto-update");
        this.pendingRestartFile = stateDirectory.resolve("pending-restart.properties");
        this.pendingRestart = readPendingRestart();
        this.state = properties.isEnabled() ? "waiting" : "disabled";
        this.message = properties.isEnabled()
                ? (pendingRestart == null ? "等待首次自动更新检查" : "检测到上次遗留的待重启版本")
                : "自动更新已关闭";
        this.nextCheck = properties.isEnabled()
                ? System.currentTimeMillis() + properties.getInitialDelay().toMillis() : null;
    }

    @Scheduled(
            initialDelayString = "${toolbox.system.auto-update.initial-delay:PT30S}",
            fixedDelayString = "${toolbox.system.auto-update.interval:PT120S}",
            scheduler = "autoUpdateTaskScheduler")
    public void scheduledCheck() {
        submitCheck();
    }

    /** 管理端点触发一次即时检查；实际工作在虚拟线程执行，不阻塞 HTTP 线程。 */
    public boolean requestCheck() {
        if (!properties.isEnabled() || shuttingDown || running.get()) return false;
        nextEligibleAt = 0;
        return submitCheck();
    }

    private boolean submitCheck() {
        if (!properties.isEnabled() || shuttingDown || running.get()) return false;
        try {
            // @Scheduled/HTTP 线程只负责触发；Git/npm/Maven 与排空等待由可管理的虚拟线程执行器承载。
            workerExecutor.submit(this::runCheck);
            return true;
        } catch (RejectedExecutionException ignored) {
            return false;
        }
    }

    public AutoUpdateStatusView status() {
        return new AutoUpdateStatusView(
                properties.isEnabled(),
                "java",
                properties.getRemote() + "/" + properties.getBranch(),
                properties.getInterval().toSeconds(),
                properties.getStableWindow().toSeconds(),
                properties.isRequireIdle(),
                state,
                message,
                lastCheck,
                nextCheck,
                lastSuccess,
                localHead,
                remoteHead,
                candidateSha,
                blockedReason,
                lastError);
    }

    void runCheck() {
        if (!properties.isEnabled()) {
            transition("disabled", "自动更新已关闭", null, null);
            return;
        }
        if (shuttingDown) return;
        // 接管已确认后只能等待当前 JVM 退出或 failure/watchdog 释放 reservation；
        // 不能让下一次定时 tick 把同一进程误判为“新版本已启动”并覆盖状态。
        if (retainedRestartReservation != null) return;
        long now = System.currentTimeMillis();
        if (now < nextEligibleAt) {
            nextCheck = nextEligibleAt;
            return;
        }
        if (!running.compareAndSet(false, true)) return;
        lastCheck = now;
        nextCheck = now + properties.getInterval().toMillis();
        try {
            Path root = repository.resolveRoot();
            try (RepositoryLock ignored = tryRepositoryLock(root)) {
                if (ignored == null) {
                    transition("waiting", "另一个更新检查正在运行", "repository-lock-busy", null);
                    return;
                }
                if (pendingRestart != null) {
                    retryPendingRestart(root);
                    return;
                }
                checkAndApply(root);
            }
        } catch (Exception e) {
            String error = AutoUpdateCommandRunner.sanitize(e.getMessage());
            transition("internal-error", "自动更新检查异常", "internal-error", error);
            log.warn("[auto-update] 检查异常：{} ({})", error, e.getClass().getSimpleName());
        } finally {
            running.set(false);
        }
    }

    private void checkAndApply(Path root) {
        AutoUpdateRepository.Validation configuration = repository.validateConfiguration();
        if (!configuration.valid()) {
            transition("invalid-configuration", configuration.message(), "invalid-configuration", null);
            return;
        }

        transition("fetching", "正在检查 " + properties.getRemote() + "/" + properties.getBranch(), null, null);
        AutoUpdateCommandRunner.Result fetch = repository.fetch(root);
        if (!fetch.success()) {
            recordFetchFailure(fetch.summary());
            return;
        }
        clearFetchBackoff();

        AutoUpdateRepository.RepositoryState repoState = repository.inspect(root);
        localHead = repoState.localHead();
        remoteHead = repoState.remoteHead();
        if (!repoState.updateAvailable()) {
            candidateSha = null;
            candidateFirstSeenAt = 0;
            transition(mapState(repoState.disposition()), repoState.reason(),
                    repoState.disposition() == AutoUpdateRepository.Disposition.UP_TO_DATE
                            ? null : repoState.disposition().name().toLowerCase(), null);
            return;
        }

        long now = System.currentTimeMillis();
        if (!repoState.remoteHead().equals(candidateSha)) {
            candidateSha = repoState.remoteHead();
            candidateFirstSeenAt = now;
            if (!candidateSha.equals(failedBuildSha)) clearBuildFailure();
            transition("stabilizing", "检测到更新，等待远端提交稳定", null, null);
            return;
        }
        long stableFor = now - candidateFirstSeenAt;
        if (stableFor < properties.getStableWindow().toMillis()) {
            long remaining = Math.max(1, (properties.getStableWindow().toMillis() - stableFor + 999) / 1_000);
            transition("stabilizing", "候选提交继续稳定中，约剩 " + remaining + " 秒", null, null);
            return;
        }

        if (candidateSha.equals(failedBuildSha) && now < buildRetryAt) {
            long remaining = Math.max(1, (buildRetryAt - now + 999) / 1_000);
            transition("build-error", "该候选上次构建失败，约 " + remaining + " 秒后退避重试",
                    "candidate-build-backoff", failedBuildError);
            return;
        }

        transition("building", "正在独立 worktree 构建候选版本", null, null);
        AutoUpdateCandidateBuilder.BuildResult build = candidateBuilder.prepare(root, candidateSha);
        if (!build.success()) {
            recordBuildFailure(candidateSha, build.error());
            return;
        }
        clearBuildFailure();
        Path stagedJar = build.jar();

        try (RestartCoordinator.RestartReservation reservation =
                     restartCoordinator.reserveAfterUpdate(stagedJar, root)) {
            if (!reservation.accepted()) {
                RestartCoordinator.RestartOutcome outcome = reservation.outcome();
                transition("restart-unavailable", "检测到更新，但没有可靠的重启接管者",
                        outcome.failure().name().toLowerCase(), outcome.message());
                return;
            }
            applyAfterDrain(root, repoState.localHead(), candidateSha, stagedJar, reservation);
        }
    }

    private void applyAfterDrain(Path root, String expectedLocal, String expectedCandidate, Path stagedJar,
                                 RestartCoordinator.RestartReservation reservation) {
        Optional<AgentWorkAdmissionGate.DrainLease> acquired = admissionGate.tryAcquireDrain();
        if (acquired.isEmpty()) {
            transition("waiting-for-idle", "另一个更新流程正在排空 Agent 工作", "drain-busy", null);
            return;
        }
        AgentWorkAdmissionGate.DrainLease lease = acquired.get();
        boolean keepDrain = false;
        try {
            if (properties.isRequireIdle() && !waitForIdle()) return;

            transition("validating", "正在进行应用前最终复核", null, null);
            AutoUpdateCommandRunner.Result finalFetch = repository.fetch(root);
            if (!finalFetch.success()) {
                recordFetchFailure(finalFetch.summary());
                return;
            }
            AutoUpdateRepository.RepositoryState finalState = repository.inspect(root);
            localHead = finalState.localHead();
            remoteHead = finalState.remoteHead();
            if (!finalState.updateAvailable()
                    || !expectedLocal.equals(finalState.localHead())
                    || !expectedCandidate.equals(finalState.remoteHead())) {
                candidateSha = finalState.remoteHead();
                candidateFirstSeenAt = System.currentTimeMillis();
                transition("state-changed", "最终复核时仓库或远端已变化，本轮不应用", "repository-changed", null);
                return;
            }
            if (properties.isRequireIdle() && !claudeChatService.activitySnapshot().safeToRestart()) {
                transition("waiting-for-idle", "最终复核时出现新的活动工作，本轮延期", "agent-active", null);
                return;
            }
            PendingRestart restartPlan = new PendingRestart(expectedCandidate,
                    stagedJar.toAbsolutePath().normalize(), root.toAbsolutePath().normalize(), processInstanceId);
            if (!persistPendingRestart(restartPlan)) {
                transition("apply-error", "无法持久化重启交接计划，本轮拒绝修改工作区",
                        "pending-restart-state-failed", "无法写入 " + pendingRestartFile);
                return;
            }
            transition("applying", "正在快进到已验证候选 " + shortSha(expectedCandidate), null, null);
            AutoUpdateCommandRunner.Result merge = repository.mergeImmutable(root, expectedCandidate);
            if (!merge.success()) {
                clearPendingRestart();
                transition("apply-error", "快进更新失败，未强制修改工作区", "ff-only-failed", merge.summary());
                return;
            }
            localHead = expectedCandidate;
            remoteHead = expectedCandidate;
            pendingRestart = restartPlan;
            retainedDrain = lease;
            retainedRestartReservation = reservation;
            keepDrain = true;
            watchRestartFailure(reservation, lease, expectedCandidate, stagedJar, root);
            RestartCoordinator.RestartOutcome restart = reservation.restartAfterUpdate();
            if (!restart.accepted()) {
                synchronized (restartStateLock) {
                    if (retainedRestartReservation == reservation) {
                        retainedRestartReservation = null;
                        retainedDrain = null;
                        keepDrain = false;
                    }
                }
                transition("restart-required", "代码已更新，但安全重启交接失败；将继续重试",
                        restart.failure().name().toLowerCase(), restart.message());
                return;
            }
            synchronized (restartStateLock) {
                if (retainedRestartReservation != reservation) return; // 异步失败回调已恢复旧服务。
                lastSuccess = System.currentTimeMillis();
                transition("restarting", "更新已应用，正在由外部进程接管重启", null, null);
            }
            scheduleDrainSafetyRelease(reservation, lease, expectedCandidate, stagedJar, root);
            log.warn("[auto-update] 已应用 {}，重启接管已确认", expectedCandidate);
        } finally {
            if (!keepDrain) lease.close();
        }
    }

    private void retryPendingRestart(Path resolvedRoot) {
        PendingRestart pending = pendingRestart;
        if (pending == null) return;
        if (!samePath(pending.root(), resolvedRoot)) {
            transition("restart-required", "待重启版本的仓库路径与当前配置不一致",
                    "repository-changed", null);
            return;
        }
        if (isRunningAppliedVersion(pending)) {
            clearPendingRestart();
            candidateSha = null;
            candidateFirstSeenAt = 0;
            lastSuccess = System.currentTimeMillis();
            transition("up-to-date", "上次更新后的新版本已成功启动", null, null);
            return;
        }
        AutoUpdateRepository.RepositoryState state = repository.inspect(resolvedRoot);
        localHead = state.localHead();
        remoteHead = state.remoteHead();
        if (state.localHead() == null) {
            transition("restart-required", "代码已更新且仍待重启；当前无法确认工作区 HEAD，已保留交接计划",
                    "pending-restart-" + mapState(state.disposition()), state.reason());
            return;
        }
        if (!pending.sha().equals(state.localHead())) {
            clearPendingRestart();
            transition("state-changed", "待重启提交已明确不再是当前 HEAD，取消自动交接", "head-changed", null);
            return;
        }
        try (RestartCoordinator.RestartReservation reservation =
                     restartCoordinator.reserveAfterUpdate(pending.jar(), pending.root())) {
            if (!reservation.accepted()) {
                RestartCoordinator.RestartOutcome outcome = reservation.outcome();
                transition("restart-required", "代码已更新，但重启通道暂不可用",
                        outcome.failure().name().toLowerCase(), outcome.message());
                return;
            }
            applyRestartOnly(pending, reservation);
        }
    }

    private void applyRestartOnly(PendingRestart pending, RestartCoordinator.RestartReservation reservation) {
        Optional<AgentWorkAdmissionGate.DrainLease> acquired = admissionGate.tryAcquireDrain();
        if (acquired.isEmpty()) {
            transition("waiting-for-idle", "等待其它排空流程结束后重试重启", "drain-busy", null);
            return;
        }
        AgentWorkAdmissionGate.DrainLease lease = acquired.get();
        boolean keepDrain = false;
        try {
            if (properties.isRequireIdle() && !waitForIdle()) return;
            retainedDrain = lease;
            retainedRestartReservation = reservation;
            keepDrain = true;
            watchRestartFailure(reservation, lease, pending.sha(), pending.jar(), pending.root());
            RestartCoordinator.RestartOutcome restart = reservation.restartAfterUpdate();
            if (!restart.accepted()) {
                synchronized (restartStateLock) {
                    if (retainedRestartReservation == reservation) {
                        retainedRestartReservation = null;
                        retainedDrain = null;
                        keepDrain = false;
                    }
                }
                transition("restart-required", "代码已更新，重启交接仍未成功",
                        restart.failure().name().toLowerCase(), restart.message());
                return;
            }
            synchronized (restartStateLock) {
                if (retainedRestartReservation != reservation) return;
                lastSuccess = System.currentTimeMillis();
                transition("restarting", "重启接管已确认", null, null);
            }
            scheduleDrainSafetyRelease(reservation, lease, pending.sha(), pending.jar(), pending.root());
        } finally {
            if (!keepDrain) lease.close();
        }
    }

    private boolean waitForIdle() {
        long deadline = System.nanoTime() + properties.getDrainTimeout().toNanos();
        while (!shuttingDown && System.nanoTime() < deadline) {
            ClaudeChatActivityView activity = claudeChatService.activitySnapshot();
            if (activity.safeToRestart()) return true;
            transition("waiting-for-idle", "等待在途 Agent 工作完成：turn=" + activity.runningTurnCount()
                    + ", oneShot=" + activity.oneShotCount() + ", background=" + activity.backgroundTaskCount(),
                    "agent-active", null);
            try {
                Thread.sleep(1_000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                transition("waiting-for-idle", "排空等待被中断，本轮延期", "interrupted", null);
                return false;
            }
        }
        transition("waiting-for-idle", "在配置的排空时限内仍有活动任务，本轮延期", "drain-timeout", null);
        return false;
    }

    private RepositoryLock tryRepositoryLock(Path root) throws IOException {
        Files.createDirectories(stateDirectory);
        String key = pathHash(root);
        Path lockPath = stateDirectory.resolve("repository-" + key + ".lock");
        FileChannel channel = FileChannel.open(lockPath,
                StandardOpenOption.CREATE, StandardOpenOption.WRITE);
        try {
            FileLock lock = channel.tryLock();
            if (lock == null) {
                channel.close();
                return null;
            }
            return new RepositoryLock(channel, lock);
        } catch (OverlappingFileLockException e) {
            channel.close();
            return null;
        }
    }

    private void recordFetchFailure(String error) {
        consecutiveFetchFailures = Math.min(consecutiveFetchFailures + 1, 16);
        long base = Math.max(1_000, properties.getInterval().toMillis());
        long multiplier = 1L << Math.min(consecutiveFetchFailures - 1, 10);
        long bounded = Math.min(properties.getMaxBackoff().toMillis(), base * multiplier);
        long jitter = ThreadLocalRandom.current().nextLong(Math.max(1, bounded / 5 + 1));
        nextEligibleAt = System.currentTimeMillis() + bounded + jitter;
        nextCheck = nextEligibleAt;
        transition("fetch-error", "拉取远端失败，将自动退避重试", "fetch-failed", error);
    }

    private void clearFetchBackoff() {
        consecutiveFetchFailures = 0;
        nextEligibleAt = 0;
    }

    private void recordBuildFailure(String sha, String error) {
        if (sha != null && sha.equals(failedBuildSha)) {
            consecutiveBuildFailures = Math.min(consecutiveBuildFailures + 1, 16);
        } else {
            failedBuildSha = sha;
            consecutiveBuildFailures = 1;
        }
        failedBuildError = error;
        long base = Math.max(1_000, properties.getInterval().toMillis());
        long multiplier = 1L << Math.min(consecutiveBuildFailures - 1, 10);
        long bounded = Math.min(properties.getMaxBackoff().toMillis(), base * multiplier);
        long jitter = ThreadLocalRandom.current().nextLong(Math.max(1, bounded / 5 + 1));
        buildRetryAt = System.currentTimeMillis() + bounded + jitter;
        transition("build-error", "候选版本构建失败，旧服务继续运行并退避重试",
                "candidate-build-failed", error);
    }

    private void clearBuildFailure() {
        failedBuildSha = null;
        failedBuildError = null;
        consecutiveBuildFailures = 0;
        buildRetryAt = 0;
    }

    private PendingRestart readPendingRestart() {
        if (!Files.isRegularFile(pendingRestartFile)) return null;
        Properties values = new Properties();
        try (Reader reader = Files.newBufferedReader(pendingRestartFile, StandardCharsets.UTF_8)) {
            values.load(reader);
            String sha = values.getProperty("sha", "").trim().toLowerCase();
            Path jar = Path.of(values.getProperty("jar", "")).toAbsolutePath().normalize();
            Path root = Path.of(values.getProperty("root", "")).toAbsolutePath().normalize();
            String issuer = values.getProperty("issuer", "legacy").trim();
            if (!SHA.matcher(sha).matches() || !Files.isRegularFile(jar) || !Files.isDirectory(root)) {
                log.warn("[auto-update] 待重启状态文件无效，保留文件供人工检查：{}", pendingRestartFile);
                return null;
            }
            Path releaseRoot = stateDirectory.resolve("releases").toAbsolutePath().normalize();
            if (!jar.startsWith(releaseRoot)) {
                log.warn("[auto-update] 待重启候选越过受管 releases 目录，拒绝加载：{}", jar);
                return null;
            }
            return new PendingRestart(sha, jar, root, issuer.isBlank() ? "legacy" : issuer);
        } catch (Exception e) {
            log.warn("[auto-update] 读取待重启状态失败：{}", AutoUpdateCommandRunner.sanitize(e.getMessage()));
            return null;
        }
    }

    private boolean persistPendingRestart(PendingRestart pending) {
        try {
            Files.createDirectories(stateDirectory);
            Properties values = new Properties();
            values.setProperty("sha", pending.sha());
            values.setProperty("jar", pending.jar().toAbsolutePath().normalize().toString());
            values.setProperty("root", pending.root().toAbsolutePath().normalize().toString());
            values.setProperty("issuer", pending.issuer());
            Path temporary = Files.createTempFile(stateDirectory, ".pending-restart-", ".tmp");
            try {
                try (Writer writer = Files.newBufferedWriter(temporary, StandardCharsets.UTF_8,
                        StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)) {
                    values.store(writer, "kai-toolbox auto-update restart handoff");
                }
                try {
                    Files.move(temporary, pendingRestartFile, StandardCopyOption.ATOMIC_MOVE,
                            StandardCopyOption.REPLACE_EXISTING);
                } catch (AtomicMoveNotSupportedException e) {
                    Files.move(temporary, pendingRestartFile, StandardCopyOption.REPLACE_EXISTING);
                }
            } finally {
                Files.deleteIfExists(temporary);
            }
            return true;
        } catch (Exception e) {
            log.warn("[auto-update] 写入待重启状态失败：{}", AutoUpdateCommandRunner.sanitize(e.getMessage()));
            return false;
        }
    }

    private void clearPendingRestart() {
        pendingRestart = null;
        try {
            Files.deleteIfExists(pendingRestartFile);
        } catch (IOException e) {
            log.warn("[auto-update] 清理待重启状态文件失败：{}", AutoUpdateCommandRunner.sanitize(e.getMessage()));
        }
    }

    private boolean isRunningAppliedVersion(PendingRestart pending) {
        try {
            var source = new ApplicationHome(JavaAutoUpdateService.class).getSource();
            if (source != null && Files.isSameFile(source.toPath(), pending.jar())) return true;
        } catch (IOException | RuntimeException e) {
            // 继续用 supervisor 的进程实例身份判断，不能因 JAR 探测失败误清当前进程创建的计划。
        }
        return restartCoordinator.isExternallySupervised()
                && !processInstanceId.equals(pending.issuer());
    }

    private static boolean samePath(Path left, Path right) {
        try {
            return Files.isSameFile(left, right);
        } catch (IOException | RuntimeException e) {
            boolean windows = System.getProperty("os.name", "").toLowerCase().contains("win");
            String a = left.toAbsolutePath().normalize().toString();
            String b = right.toAbsolutePath().normalize().toString();
            return windows ? a.equalsIgnoreCase(b) : a.equals(b);
        }
    }

    private void transition(String state, String message, String blockedReason, String error) {
        this.state = state;
        this.message = message;
        this.blockedReason = blockedReason;
        this.lastError = error == null ? null : AutoUpdateCommandRunner.sanitize(error);
        if (nextEligibleAt == 0) this.nextCheck = System.currentTimeMillis() + properties.getInterval().toMillis();
        if (error == null) {
            log.debug("[auto-update] state={} message={}", state, message);
        } else {
            log.warn("[auto-update] state={} message={} error={}", state, message, this.lastError);
        }
    }

    /** 外部接管异常时不能让仍存活的旧 JVM 永久拒绝所有 Agent；两分钟后保守恢复并继续提示待重启。 */
    private void watchRestartFailure(RestartCoordinator.RestartReservation reservation,
                                     AgentWorkAdmissionGate.DrainLease lease,
                                     String sha, Path jar, Path root) {
        reservation.failureSignal().thenAccept(failure -> {
            synchronized (restartStateLock) {
                if (shuttingDown || retainedRestartReservation != reservation) return;
                retainedRestartReservation = null;
                retainedDrain = null;
                lease.close();
                pendingRestart = new PendingRestart(sha, jar, root, processInstanceId);
                transition("restart-required", "重启交接失败，旧服务已恢复接收任务并将在空闲时重试",
                        failure.failure().name().toLowerCase(), failure.message());
            }
        });
    }

    private void scheduleDrainSafetyRelease(RestartCoordinator.RestartReservation reservation,
                                            AgentWorkAdmissionGate.DrainLease lease,
                                            String sha, Path jar, Path root) {
        Thread.ofVirtual().name("auto-update-restart-watchdog").start(() -> {
            try {
                Thread.sleep(120_000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            synchronized (restartStateLock) {
                if (shuttingDown || retainedDrain != lease || retainedRestartReservation != reservation) return;
                retainedDrain = null;
                retainedRestartReservation = null;
                lease.close();
                pendingRestart = new PendingRestart(sha, jar, root, processInstanceId);
                transition("restart-required", "重启接管超时，旧服务已恢复接收任务并将在空闲时重试",
                        "reload-timeout", "外部接管在 120 秒内未结束当前 JVM");
            }
            reservation.abandon();
            log.error("[auto-update] 外部重启接管超时，已释放 Agent admission drain sha={}", sha);
        });
    }

    private static String mapState(AutoUpdateRepository.Disposition disposition) {
        return switch (disposition) {
            case UP_TO_DATE -> "up-to-date";
            case UNAVAILABLE -> "unavailable";
            case INVALID_CONFIGURATION -> "invalid-configuration";
            case DETACHED -> "blocked-detached";
            case WRONG_BRANCH -> "blocked-branch";
            case WRONG_UPSTREAM -> "blocked-upstream";
            case OPERATION_IN_PROGRESS -> "blocked-operation";
            case DIRTY -> "blocked-dirty";
            case AHEAD -> "blocked-ahead";
            case DIVERGED -> "blocked-diverged";
            case ERROR -> "error";
            case BEHIND -> "update-available";
        };
    }

    private static String pathHash(Path root) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(root.toAbsolutePath().normalize().toString().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash, 0, 12);
        } catch (Exception e) {
            return Integer.toUnsignedString(root.toString().hashCode(), 16);
        }
    }

    private static String shortSha(String sha) {
        return sha == null ? "unknown" : sha.substring(0, Math.min(12, sha.length()));
    }

    @PreDestroy
    void shutdown() {
        shuttingDown = true;
        workerExecutor.shutdownNow();
        try {
            workerExecutor.awaitTermination(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        AgentWorkAdmissionGate.DrainLease lease = retainedDrain;
        if (lease != null) lease.close();
    }

    private record PendingRestart(String sha, Path jar, Path root, String issuer) { }

    private record RepositoryLock(FileChannel channel, FileLock lock) implements AutoCloseable {
        @Override
        public void close() throws IOException {
            try {
                lock.release();
            } finally {
                channel.close();
            }
        }
    }
}
