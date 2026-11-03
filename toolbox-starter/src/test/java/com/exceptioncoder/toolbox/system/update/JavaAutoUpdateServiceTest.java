package com.exceptioncoder.toolbox.system.update;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeChatActivityView;
import com.exceptioncoder.toolbox.claudechat.service.AgentWorkAdmissionGate;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatService;
import com.exceptioncoder.toolbox.system.RestartCoordinator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InOrder;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Properties;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JavaAutoUpdateServiceTest {

    private static final String LOCAL_SHA = "1111111111111111111111111111111111111111";
    private static final String CANDIDATE_SHA = "2222222222222222222222222222222222222222";
    private static final AutoUpdateCommandRunner.Result COMMAND_OK =
            new AutoUpdateCommandRunner.Result(0, "", "", false, null);

    @TempDir
    Path tempDir;

    private AutoUpdateProperties properties;
    private AutoUpdateRepository repository;
    private AutoUpdateCandidateBuilder candidateBuilder;
    private RestartCoordinator restartCoordinator;
    private RestartCoordinator.RestartReservation restartReservation;
    private ClaudeChatService claudeChatService;
    private AgentWorkAdmissionGate admissionGate;
    private JavaAutoUpdateService service;
    private Path repositoryRoot;
    private Path stagedJar;

    @BeforeEach
    void setUp() throws Exception {
        repositoryRoot = Files.createDirectories(tempDir.resolve("repository"));
        stagedJar = tempDir.resolve("release/toolbox-starter/target/kai-toolbox.jar");

        properties = new AutoUpdateProperties();
        properties.setScheduleMode(AutoUpdateProperties.ScheduleMode.INTERVAL);
        properties.setRestartPolicy(AutoUpdateProperties.RestartPolicy.IDLE);
        properties.setStableWindow(Duration.ofMillis(1));
        properties.setIdleWindow(Duration.ofMillis(1));
        properties.setInterval(Duration.ofSeconds(30));
        properties.setDrainTimeout(Duration.ofMillis(25));
        repository = mock(AutoUpdateRepository.class);
        candidateBuilder = mock(AutoUpdateCandidateBuilder.class);
        restartCoordinator = mock(RestartCoordinator.class);
        restartReservation = mock(RestartCoordinator.RestartReservation.class);
        claudeChatService = mock(ClaudeChatService.class);
        admissionGate = new AgentWorkAdmissionGate();

        when(repository.resolveRoot()).thenReturn(repositoryRoot);
        when(repository.validateConfiguration()).thenReturn(new AutoUpdateRepository.Validation(true, "ok"));
        when(repository.fetch(repositoryRoot)).thenReturn(COMMAND_OK);
        when(repository.inspect(repositoryRoot)).thenReturn(behindState());
        when(claudeChatService.activitySnapshot()).thenReturn(idleActivity());
        when(restartReservation.accepted()).thenReturn(true);
        when(restartReservation.failureSignal()).thenReturn(new CompletableFuture<>());
        when(restartReservation.restartAfterUpdate())
                .thenReturn(RestartCoordinator.RestartOutcome.accepted("accepted"));
        when(restartCoordinator.reserveAfterUpdate(stagedJar, repositoryRoot)).thenReturn(restartReservation);

        service = new JavaAutoUpdateService(
                properties,
                repository,
                candidateBuilder,
                restartCoordinator,
                admissionGate,
                claudeChatService,
                tempDir.toString());
    }

    @AfterEach
    void tearDown() {
        service.shutdown();
    }

    @Test
    void dailyModeDoesNotFetchOrRestartBeforeTrigger() {
        properties.setScheduleMode(AutoUpdateProperties.ScheduleMode.DAILY);
        service.runCheck();
        service.scheduledCheck();
        verify(repository, never()).resolveRoot();
        verify(restartCoordinator, never()).reserveAfterUpdate(any(), any());
    }

    @Test
    void dailyTriggerUsesExistingCandidateFlow() throws Exception {
        properties.setScheduleMode(AutoUpdateProperties.ScheduleMode.DAILY);
        service.scheduledDailyCheck();
        verify(repository, org.mockito.Mockito.timeout(2_000)).inspect(repositoryRoot);
        verify(repository, never()).mergeImmutable(any(), any());
    }

    @Test
    void firstObservationOnlyStartsCandidateStabilityWindow() {
        service.runCheck();

        assertThat(service.status().state()).isEqualTo("stabilizing");
        assertThat(service.status().candidateHead()).isEqualTo(CANDIDATE_SHA);
        assertThat(admissionGate.isDraining()).isFalse();
        verify(candidateBuilder, never()).prepare(any(), any());
        verify(repository, never()).mergeImmutable(any(), any());
        verify(restartCoordinator, never()).reserveAfterUpdate(any(), any());
    }

    @Test
    void stableCandidateBuildsDrainsRevalidatesMergesImmutableShaAndRestarts() throws Exception {
        observeCandidateAndWaitUntilStable();
        when(candidateBuilder.prepare(repositoryRoot, CANDIDATE_SHA)).thenReturn(
                new AutoUpdateCandidateBuilder.BuildResult(
                        true, stagedJar.getParent(), stagedJar, false, null));
        when(repository.mergeImmutable(repositoryRoot, CANDIDATE_SHA)).thenReturn(COMMAND_OK);
        clearInvocations(repository, candidateBuilder, restartCoordinator, restartReservation, claudeChatService);

        runAfterQuietWindow();

        assertThat(service.status().state()).isEqualTo("restarting");
        assertThat(service.status().localHead()).isEqualTo(CANDIDATE_SHA);
        assertThat(service.status().lastSuccess()).isNotNull();
        assertThat(admissionGate.isDraining()).isTrue();
        InOrder ordered = inOrder(
                candidateBuilder, restartCoordinator, restartReservation, repository, claudeChatService);
        ordered.verify(repository).fetch(repositoryRoot);
        ordered.verify(repository).inspect(repositoryRoot);
        ordered.verify(candidateBuilder).prepare(repositoryRoot, CANDIDATE_SHA);
        ordered.verify(repository).mergeImmutable(repositoryRoot, CANDIDATE_SHA);
        ordered.verify(restartReservation).failureSignal();
        ordered.verify(restartReservation).restartAfterUpdate();
        ordered.verify(restartReservation).close();
        verify(repository).mergeImmutable(repositoryRoot, CANDIDATE_SHA);
        verify(repository, never()).mergeImmutable(eq(repositoryRoot),
                org.mockito.ArgumentMatchers.argThat(value -> !CANDIDATE_SHA.equals(value)));
    }

    @Test
    void activityAppearingDuringFinalValidationDefersMergeAndReleasesDrain() throws Exception {
        observeCandidateAndWaitUntilStable();
        when(candidateBuilder.prepare(repositoryRoot, CANDIDATE_SHA)).thenReturn(
                new AutoUpdateCandidateBuilder.BuildResult(
                        true, stagedJar.getParent(), stagedJar, false, null));
        when(claudeChatService.activitySnapshot()).thenReturn(idleActivity(), idleActivity(), activeActivity());

        runAfterQuietWindow();

        assertThat(service.status().state()).isEqualTo("waiting-for-idle");
        assertThat(service.status().blockedReason()).isEqualTo("agent-active");
        assertThat(admissionGate.isDraining()).isFalse();
        verify(claudeChatService, times(3)).activitySnapshot();
        verify(repository, never()).mergeImmutable(any(), any());
        verify(restartReservation, never()).restartAfterUpdate();
        verify(restartReservation).close();
    }

    @Test
    void failedCandidateBuildNeverDrainsMergesOrRestarts() throws Exception {
        observeCandidateAndWaitUntilStable();
        when(candidateBuilder.prepare(repositoryRoot, CANDIDATE_SHA)).thenReturn(
                new AutoUpdateCandidateBuilder.BuildResult(
                        false, null, null, false, "candidate compilation failed"));

        service.runCheck();

        assertThat(service.status().state()).isEqualTo("build-error");
        assertThat(service.status().blockedReason()).isEqualTo("candidate-build-failed");
        assertThat(service.status().lastError()).contains("candidate compilation failed");
        assertThat(admissionGate.isDraining()).isFalse();
        verify(restartCoordinator, never()).reserveAfterUpdate(any(), any());
        verify(repository, never()).mergeImmutable(any(), any());
        verify(restartReservation, never()).restartAfterUpdate();

        clearInvocations(candidateBuilder);
        service.runCheck();
        assertThat(service.status().blockedReason()).isEqualTo("candidate-build-backoff");
        verify(candidateBuilder, never()).prepare(any(), any());
    }

    @Test
    void persistedRestartPlanSurvivesDirtyWorkspaceWithUnknownHead() throws Exception {
        service.shutdown();
        Path managedJar = tempDir.resolve("auto-update/releases/" + CANDIDATE_SHA
                + "/toolbox-starter/target/kai-toolbox.jar");
        Files.createDirectories(managedJar.getParent());
        Files.writeString(managedJar, "candidate");
        Path pendingFile = tempDir.resolve("auto-update/pending-restart.properties");
        Properties pending = new Properties();
        pending.setProperty("sha", CANDIDATE_SHA);
        pending.setProperty("jar", managedJar.toString());
        pending.setProperty("root", repositoryRoot.toString());
        pending.setProperty("issuer", "previous-process-instance");
        try (var writer = Files.newBufferedWriter(pendingFile)) {
            pending.store(writer, "test");
        }
        when(repository.inspect(repositoryRoot)).thenReturn(new AutoUpdateRepository.RepositoryState(
                AutoUpdateRepository.Disposition.DIRTY,
                "workspace has local edits",
                null,
                null));
        clearInvocations(restartCoordinator, restartReservation);
        admissionGate = new AgentWorkAdmissionGate();
        service = new JavaAutoUpdateService(
                properties,
                repository,
                candidateBuilder,
                restartCoordinator,
                admissionGate,
                claudeChatService,
                tempDir.toString());

        service.runCheck();

        assertThat(service.status().state()).isEqualTo("restart-required");
        assertThat(service.status().blockedReason()).isEqualTo("pending-restart-blocked-dirty");
        assertThat(Files.isRegularFile(pendingFile)).isTrue();
        verify(restartCoordinator, never()).reserveAfterUpdate(any(), any());
    }

    private void runAfterQuietWindow() throws Exception {
        service.runCheck();
        assertThat(service.status().blockedReason()).isEqualTo("idle-window");
        assertThat(admissionGate.isDraining()).isFalse();
        Thread.sleep(5);
        service.runCheck();
    }

    @Test
    void failedRestoreNeverRestartsAndFailedHandoffIsNotRetried() throws Exception {
        observeCandidateAndWaitUntilStable();
        when(candidateBuilder.prepare(repositoryRoot, CANDIDATE_SHA)).thenReturn(
                new AutoUpdateCandidateBuilder.BuildResult(true, stagedJar.getParent(), stagedJar, false, null));
        when(repository.mergeImmutable(repositoryRoot, CANDIDATE_SHA)).thenReturn(
                AutoUpdateCommandRunner.Result.failed("stash restoration conflict"));
        runAfterQuietWindow();
        assertThat(service.status().state()).isEqualTo("apply-error");
        assertThat(admissionGate.isDraining()).isFalse();
        verify(restartReservation, never()).restartAfterUpdate();

        when(repository.mergeImmutable(repositoryRoot, CANDIDATE_SHA)).thenReturn(COMMAND_OK);
        CompletableFuture<RestartCoordinator.RestartOutcome> failure = new CompletableFuture<>();
        when(restartReservation.failureSignal()).thenReturn(failure);
        service.runCheck();
        assertThat(service.status().state()).isEqualTo("restarting");
        failure.complete(RestartCoordinator.RestartOutcome.rejected(
                RestartCoordinator.Failure.HANDOFF_FAILED, "timeout"));
        assertThat(admissionGate.isDraining()).isFalse();
        when(repository.inspect(repositoryRoot)).thenReturn(new AutoUpdateRepository.RepositoryState(
                AutoUpdateRepository.Disposition.UP_TO_DATE, "current", CANDIDATE_SHA, CANDIDATE_SHA));
        service.runCheck();
        assertThat(service.status().blockedReason()).isEqualTo("restart-confirmation-required");
        verify(restartReservation, times(1)).restartAfterUpdate();
    }

    @Test
    void shortTaskBetweenPollsResetsQuietWindowWithoutBlockingAdmission() throws Exception {
        observeCandidateAndWaitUntilStable();
        when(candidateBuilder.prepare(repositoryRoot, CANDIDATE_SHA)).thenReturn(
                new AutoUpdateCandidateBuilder.BuildResult(true, stagedJar.getParent(), stagedJar, false, null));
        service.runCheck();
        Thread.sleep(5);
        assertThat(admissionGate.tryAdmit(() -> { })).isTrue();
        service.runCheck();
        assertThat(service.status().blockedReason()).isEqualTo("idle-window");
        assertThat(admissionGate.isDraining()).isFalse();
        verify(restartCoordinator, never()).reserveAfterUpdate(any(), any());
    }

    @Test
    void queuedMessagesAndManualPolicyKeepPreparedCandidateWithoutRestart() throws Exception {
        observeCandidateAndWaitUntilStable();
        when(candidateBuilder.prepare(repositoryRoot, CANDIDATE_SHA)).thenReturn(
                new AutoUpdateCandidateBuilder.BuildResult(true, stagedJar.getParent(), stagedJar, false, null));
        when(claudeChatService.hasQueuedMessages()).thenReturn(true);
        service.runCheck();
        assertThat(service.status().blockedReason()).isEqualTo("agent-active");
        when(claudeChatService.hasQueuedMessages()).thenReturn(false);
        properties.setRestartPolicy(AutoUpdateProperties.RestartPolicy.MANUAL);
        service.runCheck();
        assertThat(service.status().blockedReason()).isEqualTo("manual-restart");
        verify(repository, never()).mergeImmutable(any(), any());
        verify(restartCoordinator, never()).reserveAfterUpdate(any(), any());
    }

    private void observeCandidateAndWaitUntilStable() throws Exception {
        service.runCheck();
        assertThat(service.status().state()).isEqualTo("stabilizing");
        Thread.sleep(20);
    }

    private static AutoUpdateRepository.RepositoryState behindState() {
        return new AutoUpdateRepository.RepositoryState(
                AutoUpdateRepository.Disposition.BEHIND,
                "remote candidate is ahead",
                LOCAL_SHA,
                CANDIDATE_SHA);
    }

    private static ClaudeChatActivityView idleActivity() {
        return new ClaudeChatActivityView(false, true, 0, 0, 0, 0, 0, 0, System.currentTimeMillis());
    }

    private static ClaudeChatActivityView activeActivity() {
        return new ClaudeChatActivityView(true, false, 1, 1, 0, 0, 0, 0, System.currentTimeMillis());
    }
}
