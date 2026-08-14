package com.exceptioncoder.toolbox.system;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.ApplicationArguments;

import java.nio.file.Path;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

class RestartCoordinatorTest {

    @TempDir
    Path tempDir;

    private RestartRuntime runtime;
    private SupervisorControlClient supervisor;
    private CandidateHandoffLauncher handoff;
    private RestartShutdown shutdown;
    private ApplicationArguments arguments;

    @BeforeEach
    void setUp() {
        runtime = mock(RestartRuntime.class);
        supervisor = mock(SupervisorControlClient.class);
        handoff = mock(CandidateHandoffLauncher.class);
        shutdown = mock(RestartShutdown.class);
        arguments = mock(ApplicationArguments.class);
        when(arguments.getSourceArgs()).thenReturn(new String[]{"--server.port=18080"});
    }

    @Test
    void supervisedPreflightValidatesSupervisorAndIgnoresCandidateJar() {
        Path repo = tempDir.resolve("repo");
        when(runtime.isExternallySupervised()).thenReturn(true);
        when(supervisor.preflight(repo)).thenReturn(RestartCoordinator.RestartOutcome.accepted("ok"));
        RestartCoordinator coordinator = coordinator();

        var outcome = coordinator.preflightAfterUpdate(null, repo);

        assertTrue(outcome.accepted());
        verify(supervisor).preflight(repo);
        verify(handoff, never()).preflight(null, repo);
    }

    @Test
    void directUpdateSchedulesExitOnlyAfterSuccessfulChildHandshake() {
        Path repo = tempDir.resolve("repo");
        Path jar = tempDir.resolve("candidate.jar");
        ProcessHandle process = mock(ProcessHandle.class);
        CandidateHandoffLauncher.Launch launch = new CandidateHandoffLauncher.Launch(
                RestartCoordinator.RestartOutcome.accepted("ready"), process, tempDir.resolve("ready"));
        when(runtime.isExternallySupervised()).thenReturn(false);
        when(handoff.launch(jar, repo, java.util.List.of("--server.port=18080"))).thenReturn(launch);
        RestartCoordinator coordinator = coordinator();

        var outcome = coordinator.restartAfterUpdate(jar, repo);

        assertTrue(outcome.accepted());
        verify(shutdown).afterResponse(org.mockito.ArgumentMatchers.eq(process),
                org.mockito.ArgumentMatchers.any(Runnable.class));
    }

    @Test
    void manualRestartWithoutSupervisorOrExecutableJarNeverExits() {
        when(runtime.isExternallySupervised()).thenReturn(false);
        when(runtime.repositoryRoot()).thenReturn(Optional.of(tempDir));
        when(runtime.currentExecutableJar()).thenReturn(Optional.empty());
        RestartCoordinator coordinator = coordinator();

        var outcome = coordinator.restartCurrent();

        assertFalse(outcome.accepted());
        assertEquals(RestartCoordinator.Failure.CURRENT_JAR_UNAVAILABLE, outcome.failure());
        verify(shutdown, never()).afterResponse(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void reservationBlocksManualRestartAcrossMergeAndDoesNotCasTwice() {
        Path repo = tempDir.resolve("reservation-repo");
        Path jar = tempDir.resolve("reservation.jar");
        ProcessHandle process = mock(ProcessHandle.class);
        CandidateHandoffLauncher.Launch launch = new CandidateHandoffLauncher.Launch(
                RestartCoordinator.RestartOutcome.accepted("waiting"), process, tempDir.resolve("ready-reservation"));
        when(runtime.isExternallySupervised()).thenReturn(false);
        when(handoff.preflight(jar, repo)).thenReturn(RestartCoordinator.RestartOutcome.accepted("preflight"));
        when(handoff.launch(jar, repo, java.util.List.of("--server.port=18080"))).thenReturn(launch);
        RestartCoordinator coordinator = coordinator();

        try (var reservation = coordinator.reserveAfterUpdate(jar, repo)) {
            assertTrue(reservation.accepted());
            assertEquals(RestartCoordinator.Failure.ALREADY_RESTARTING,
                    coordinator.restartCurrent().failure());
            assertTrue(reservation.restartAfterUpdate().accepted());
        }

        verify(shutdown).afterResponse(eq(process), any(Runnable.class));
    }

    @Test
    void closingUncommittedReservationReleasesRestartSlot() {
        Path repo = tempDir.resolve("close-repo");
        Path jar = tempDir.resolve("close.jar");
        when(runtime.isExternallySupervised()).thenReturn(false);
        when(handoff.preflight(jar, repo)).thenReturn(RestartCoordinator.RestartOutcome.accepted("preflight"));
        RestartCoordinator coordinator = coordinator();

        try (var first = coordinator.reserveAfterUpdate(jar, repo)) {
            assertTrue(first.accepted());
        }
        try (var second = coordinator.reserveAfterUpdate(jar, repo)) {
            assertTrue(second.accepted());
        }
    }

    @Test
    void asynchronousTakeoverFailureCompletesReservationSignal() {
        Path repo = tempDir.resolve("signal-repo");
        Path jar = tempDir.resolve("signal.jar");
        ProcessHandle process = mock(ProcessHandle.class);
        CandidateHandoffLauncher.Launch launch = new CandidateHandoffLauncher.Launch(
                RestartCoordinator.RestartOutcome.accepted("waiting"), process, tempDir.resolve("ready-signal"));
        when(runtime.isExternallySupervised()).thenReturn(false);
        when(handoff.preflight(jar, repo)).thenReturn(RestartCoordinator.RestartOutcome.accepted("preflight"));
        when(handoff.launch(jar, repo, java.util.List.of("--server.port=18080"))).thenReturn(launch);
        org.mockito.ArgumentCaptor<Runnable> failure = org.mockito.ArgumentCaptor.forClass(Runnable.class);
        RestartCoordinator coordinator = coordinator();
        var reservation = coordinator.reserveAfterUpdate(jar, repo);

        assertTrue(reservation.restartAfterUpdate().accepted());
        verify(shutdown).afterResponse(eq(process), failure.capture());
        failure.getValue().run();

        RestartCoordinator.RestartOutcome signaled = reservation.failureSignal().toCompletableFuture().join();
        assertFalse(signaled.accepted());
        assertFalse(reservation.accepted());
    }

    @Test
    void watchdogAbandonCancelsDirectReplacementAndReleasesSlot() {
        Path repo = tempDir.resolve("abandon-repo");
        Path jar = tempDir.resolve("abandon.jar");
        ProcessHandle process = mock(ProcessHandle.class);
        CandidateHandoffLauncher.Launch launch = new CandidateHandoffLauncher.Launch(
                RestartCoordinator.RestartOutcome.accepted("waiting"), process, tempDir.resolve("ready-abandon"));
        when(runtime.isExternallySupervised()).thenReturn(false);
        when(handoff.preflight(jar, repo)).thenReturn(RestartCoordinator.RestartOutcome.accepted("preflight"));
        when(handoff.launch(jar, repo, java.util.List.of("--server.port=18080"))).thenReturn(launch);
        RestartCoordinator coordinator = coordinator();
        var reservation = coordinator.reserveAfterUpdate(jar, repo);
        assertTrue(reservation.restartAfterUpdate().accepted());

        reservation.abandon();

        verify(handoff).cancel(launch);
        assertFalse(reservation.failureSignal().toCompletableFuture().join().accepted());
        when(handoff.preflight(jar, repo)).thenReturn(RestartCoordinator.RestartOutcome.accepted("again"));
        try (var next = coordinator.reserveAfterUpdate(jar, repo)) {
            assertTrue(next.accepted());
        }
    }

    @Test
    void acceptedSupervisorReloadMakesDuplicateRestartIdempotentlyReject() {
        when(runtime.isExternallySupervised()).thenReturn(true);
        when(runtime.repositoryRoot()).thenReturn(Optional.of(tempDir));
        when(supervisor.requestFullReload(tempDir))
                .thenReturn(RestartCoordinator.RestartOutcome.accepted("reloading"));
        RestartCoordinator coordinator = coordinator();

        assertTrue(coordinator.restartCurrent().accepted());
        var duplicate = coordinator.restartCurrent();

        assertFalse(duplicate.accepted());
        assertEquals(RestartCoordinator.Failure.ALREADY_RESTARTING, duplicate.failure());
        verify(supervisor).requestFullReload(tempDir);
    }

    private RestartCoordinator coordinator() {
        return new RestartCoordinator(runtime, supervisor, handoff, shutdown, arguments);
    }
}
