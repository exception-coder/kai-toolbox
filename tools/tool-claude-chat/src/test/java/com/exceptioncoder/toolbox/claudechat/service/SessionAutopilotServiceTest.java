package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotCompletionPolicy;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotState;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAutopilotRepository;
import com.exceptioncoder.toolbox.claudechat.service.ContinuousExecutionSkillProvisioner.ProvisioningResult;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeOption;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.TaskSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionTurnSettledEvent;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionManualInputEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionAutopilotServiceTest {

    @Test
    void startBindsTheFirstTaskBeforeDispatchingTheInitialContinuation() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
        AutopilotProjectContextResolver projects = mock(AutopilotProjectContextResolver.class);
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        ContinuousExecutionSkillProvisioner skill = mock(ContinuousExecutionSkillProvisioner.class);
        var identity = new AutopilotProjectContextResolver.ProjectIdentity(java.nio.file.Path.of("D:/repo"),
                "repository", "feature/autopilot", "workspace", "agent-session");
        ChangeSnapshot snapshot = new ChangeSnapshot("session-autopilot", "revision-a", 1, 2,
                List.of(new TaskSnapshot("1.1", 1, "done", true),
                        new TaskSnapshot("1.2", 2, "next", false)), Map.of(),
                new TaskSnapshot("1.2", 2, "next", false));
        when(projects.resolve("session-1", "D:/repo")).thenReturn(identity);
        when(openSpec.listChanges(identity.projectRoot()))
                .thenReturn(List.of(new ChangeOption("session-autopilot", 1, 2, "now")));
        when(openSpec.inspect(identity.projectRoot(), "session-autopilot")).thenReturn(snapshot);
        when(skill.provision(identity.projectRoot())).thenReturn(new ProvisioningResult("1.0.0", "hash",
                List.of(".claude/skills/forge/SKILL.md", ".agents/skills/forge/SKILL.md"), List.of()));
        when(repository.findBySessionId("session-1")).thenReturn(Optional.empty());
        SessionAutopilotService service = new SessionAutopilotService(repository,
                mock(ClaudeChatSessionRepository.class), mock(ClaudeChatSessionAccessPolicy.class), queue,
                mock(SessionRuntimeStateService.class), projects, openSpec, mock(OpenSpecContinuousRunner.class),
                skill, new ObjectMapper(), mock(ApplicationEventPublisher.class));

        var view = service.start("session-1", new SessionAutopilotService.StartRequest(
                "D:/repo", "session-autopilot", "完成 change", true, 8, 3, 240));

        ArgumentCaptor<SessionAutopilotRun> saved = ArgumentCaptor.forClass(SessionAutopilotRun.class);
        verify(repository).replace(saved.capture());
        assertThat(saved.getValue().context().currentTaskId()).isEqualTo("1.2");
        assertThat(saved.getValue().context().currentTaskOrdinal()).isEqualTo(2);
        assertThat(saved.getValue().context().agentSessionRef()).isEqualTo("agent-session");
        assertThat(view.state()).isEqualTo("ACTIVE");
        verify(queue).saveInternal(eq("session-1"), any(), any(), any(), any(), anyLong());
    }

    @Test
    void settledTurnWithPendingTaskQueuesExactlyOneRuntimeContinuation() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
        ClaudeChatSessionAccessPolicy access = mock(ClaudeChatSessionAccessPolicy.class);
        QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
        SessionRuntimeStateService runtime = mock(SessionRuntimeStateService.class);
        AutopilotProjectContextResolver projects = mock(AutopilotProjectContextResolver.class);
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        ForgeQualityGateAdapter quality = mock(ForgeQualityGateAdapter.class);
        ContinuousExecutionSkillProvisioner skill = mock(ContinuousExecutionSkillProvisioner.class);
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        OpenSpecContinuousRunner runner = new OpenSpecContinuousRunner(openSpec, quality);
        SessionAutopilotService service = new SessionAutopilotService(repository, sessions, access, queue,
                runtime, projects, openSpec, runner, skill, new ObjectMapper(), events);
        SessionAutopilotRun run = run();
        ChangeSnapshot snapshot = new ChangeSnapshot("session-autopilot", "revision-a", 0, 1,
                List.of(new TaskSnapshot("6.4", 28, "pending", false)), Map.of(),
                new TaskSnapshot("6.4", 28, "pending", false));
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(run));
        when(openSpec.inspect(java.nio.file.Path.of("D:/repo"), "session-autopilot")).thenReturn(snapshot);
        when(repository.appendStep(any())).thenReturn(true);
        when(repository.update(any(), anyLong())).thenReturn(true);

        service.onSettled(new SessionTurnSettledEvent("session-1", "turn-9", "end_turn", true,
                System.currentTimeMillis()));

        verify(queue, timeout(2_000).times(1)).saveInternal(eq("session-1"),
                eq("autopilot:run-1:1:apply:6.4:1"), any(), any(), any(), anyLong());
        ArgumentCaptor<SessionAutopilotRun> saved = ArgumentCaptor.forClass(SessionAutopilotRun.class);
        verify(repository, timeout(2_000)).update(saved.capture(), eq(0L));
        assertThat(saved.getValue().context().agentSessionRef()).isEqualTo("codex-session-1");
        assertThat(saved.getValue().state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(saved.getValue().reason()).contains("自动续跑同一 task");
    }

    @Test
    void dashboardFiltersInaccessibleRunsBeforeBuildingThePage() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
        ClaudeChatSessionAccessPolicy access = mock(ClaudeChatSessionAccessPolicy.class);
        SessionAutopilotService service = service(repository, sessions, access);
        SessionAutopilotRun visible = run();
        SessionAutopilotRun hidden = withIdentity(visible, "run-2", "session-2");
        when(repository.findRecent("", null, null, 200)).thenReturn(List.of(visible, hidden));
        when(repository.findRecentByStates("", null, null, 50, List.of(AutopilotState.ACTIVE)))
                .thenReturn(List.of(visible, hidden));
        when(access.canAccessCurrentUser("session-1")).thenReturn(true);
        when(access.canAccessCurrentUser("session-2")).thenReturn(false);

        var dashboard = service.dashboard("active", "", null, 30);

        assertThat(dashboard.items()).extracting(item -> item.run().sessionId())
                .containsExactly("session-1");
        assertThat(dashboard.counts().active()).isEqualTo(1);
    }

    @Test
    void manualInputPausesBeforeClearingAutomaticContinuation() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
        SessionAutopilotRun run = run();
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(run));
        when(repository.update(any(), eq(0L))).thenReturn(true);
        SessionAutopilotService service = new SessionAutopilotService(repository,
                mock(ClaudeChatSessionRepository.class), mock(ClaudeChatSessionAccessPolicy.class), queue,
                mock(SessionRuntimeStateService.class), mock(AutopilotProjectContextResolver.class),
                mock(OpenSpecAutopilotAdapter.class), mock(OpenSpecContinuousRunner.class),
                mock(ContinuousExecutionSkillProvisioner.class), new ObjectMapper(),
                mock(ApplicationEventPublisher.class));

        service.onManualInput(new SessionManualInputEvent("session-1", "send"));

        ArgumentCaptor<SessionAutopilotRun> saved = ArgumentCaptor.forClass(SessionAutopilotRun.class);
        verify(repository).update(saved.capture(), eq(0L));
        assertThat(saved.getValue().state()).isEqualTo(AutopilotState.PAUSED);
        assertThat(saved.getValue().reason()).contains("用户").contains("send");
        verify(queue).clearInternal("session-1");
    }

    @Test
    void restartReconciliationQueuesActiveRunWithoutABrowserObserver() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
        SessionRuntimeStateService runtime = mock(SessionRuntimeStateService.class);
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        SessionAutopilotRun run = run();
        ChangeSnapshot snapshot = new ChangeSnapshot("session-autopilot", "revision-a", 0, 1,
                List.of(new TaskSnapshot("6.4", 28, "pending", false)), Map.of(),
                new TaskSnapshot("6.4", 28, "pending", false));
        when(repository.findRecent("", null, null, 200)).thenReturn(List.of(run));
        when(queue.hasInternal("session-1")).thenReturn(false);
        when(runtime.canStartTurn("session-1"))
                .thenReturn(new SessionRuntimeStateService.SendDecision(true, "CONSISTENT_IDLE", null));
        when(openSpec.inspect(java.nio.file.Path.of("D:/repo"), "session-autopilot")).thenReturn(snapshot);
        SessionAutopilotService service = new SessionAutopilotService(repository,
                mock(ClaudeChatSessionRepository.class), mock(ClaudeChatSessionAccessPolicy.class), queue,
                runtime, mock(AutopilotProjectContextResolver.class), openSpec,
                mock(OpenSpecContinuousRunner.class), mock(ContinuousExecutionSkillProvisioner.class),
                new ObjectMapper(), mock(ApplicationEventPublisher.class));

        service.reconcileActiveRuns();

        verify(queue).saveInternal(eq("session-1"), eq("autopilot:run-1:1:apply:6.4:0"),
                any(), any(), any(), anyLong());
    }

    @Test
    void pauseResumeAndStopAreVersionedAndResumeCreatesANewGeneration() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        SessionAutopilotRun active = run();
        ChangeSnapshot snapshot = new ChangeSnapshot("session-autopilot", "revision-b", 0, 1,
                List.of(new TaskSnapshot("6.4", 28, "pending", false)), Map.of(),
                new TaskSnapshot("6.4", 28, "pending", false));
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(active));
        when(repository.update(any(), eq(0L))).thenReturn(true);
        when(openSpec.inspect(java.nio.file.Path.of("D:/repo"), "session-autopilot")).thenReturn(snapshot);
        SessionAutopilotService service = new SessionAutopilotService(repository,
                mock(ClaudeChatSessionRepository.class), mock(ClaudeChatSessionAccessPolicy.class), queue,
                mock(SessionRuntimeStateService.class), mock(AutopilotProjectContextResolver.class), openSpec,
                mock(OpenSpecContinuousRunner.class), mock(ContinuousExecutionSkillProvisioner.class),
                new ObjectMapper(), mock(ApplicationEventPublisher.class));

        assertThat(service.action("session-1", "pause", 0).state()).isEqualTo("PAUSED");
        assertThat(service.action("session-1", "stop", 0).state()).isEqualTo("STOPPED");
        var resumed = service.action("session-1", "resume", 0);

        assertThat(resumed.state()).isEqualTo("ACTIVE");
        assertThat(resumed.generation()).isEqualTo(2);
        assertThat(resumed.currentTaskId()).isEqualTo("6.4");
    }

    @Test
    void resumeArchivedChangeWithoutInspectingMissingActiveChange() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        SessionAutopilotRun source = run();
        OpenSpecExecutionContext archivedContext = new OpenSpecExecutionContext(
                source.context().projectRoot(), source.context().repositoryIdentity(),
                source.context().branchAtStart(), source.context().workspaceFingerprint(),
                "openspec-task-board", source.context().changeRevision(), null, null,
                OpenSpecExecutionPhase.ARCHIVE, source.context().agentSessionRef(), 8, 17);
        SessionAutopilotRun waiting = new SessionAutopilotRun(
                source.id(), source.sessionId(), source.goal(), source.completionPolicy(),
                AutopilotState.WAITING_USER, "无法读取当前 OpenSpec 状态", archivedContext,
                8, source.maxTurns(), 0, source.maxNoProgress(), true, source.skillActivated(),
                source.skillPath(), source.skillVersion(), source.skillFingerprint(), true,
                24, 24, null, null, null, null, null, null,
                source.startedAt(), source.deadlineAt(), source.updatedAt());
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(waiting));
        when(repository.update(any(), eq(17L))).thenReturn(true);
        when(openSpec.isArchived(java.nio.file.Path.of("D:/repo"), "D:/repo", "openspec-task-board"))
                .thenReturn(true);
        SessionAutopilotService service = new SessionAutopilotService(repository,
                mock(ClaudeChatSessionRepository.class), mock(ClaudeChatSessionAccessPolicy.class), queue,
                mock(SessionRuntimeStateService.class), mock(AutopilotProjectContextResolver.class), openSpec,
                mock(OpenSpecContinuousRunner.class), mock(ContinuousExecutionSkillProvisioner.class),
                new ObjectMapper(), mock(ApplicationEventPublisher.class));

        var resumed = service.action("session-1", "resume", 17);

        assertThat(resumed.state()).isEqualTo("ACTIVE");
        assertThat(resumed.phase()).isEqualTo("ARCHIVE");
        assertThat(resumed.generation()).isEqualTo(9);
        verify(openSpec, never()).inspect(any(), any());
        verify(queue, never()).saveInternal(any(), any(), any(), any(), any(), anyLong());
    }

    @Test
    void progressEvidenceIsBoundedAndSensitiveValuesAreRedacted() throws Exception {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        SessionAutopilotRun run = run();
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(run));
        when(repository.update(any(), eq(0L))).thenReturn(true);
        ObjectMapper mapper = new ObjectMapper();
        SessionAutopilotService service = new SessionAutopilotService(repository,
                mock(ClaudeChatSessionRepository.class), mock(ClaudeChatSessionAccessPolicy.class),
                mock(QueuedChatMessageService.class), mock(SessionRuntimeStateService.class),
                mock(AutopilotProjectContextResolver.class), mock(OpenSpecAutopilotAdapter.class),
                mock(OpenSpecContinuousRunner.class), mock(ContinuousExecutionSkillProvisioner.class), mapper,
                mock(ApplicationEventPublisher.class));
        List<String> evidence = java.util.stream.IntStream.range(0, 25)
                .mapToObj(index -> "token=secret-" + index + " " + "x".repeat(2_100)).toList();

        service.reportProgress("session-1", new SessionAutopilotService.ProgressReport(
                "CONTINUE", "summary", "next", evidence, evidence, null));

        ArgumentCaptor<SessionAutopilotRun> saved = ArgumentCaptor.forClass(SessionAutopilotRun.class);
        verify(repository).update(saved.capture(), eq(0L));
        List<?> stored = mapper.readValue(saved.getValue().latestEvidenceJson(), List.class);
        assertThat(stored).hasSize(20);
        assertThat(stored).allSatisfy(item -> {
            assertThat(item.toString()).hasSizeLessThanOrEqualTo(2_000);
            assertThat(item.toString()).contains("token=[REDACTED]").doesNotContain("secret-");
        });
    }

    private SessionAutopilotService service(SessionAutopilotRepository repository,
                                            ClaudeChatSessionRepository sessions,
                                            ClaudeChatSessionAccessPolicy access) {
        return new SessionAutopilotService(repository, sessions, access,
                mock(QueuedChatMessageService.class), mock(SessionRuntimeStateService.class),
                mock(AutopilotProjectContextResolver.class), mock(OpenSpecAutopilotAdapter.class),
                mock(OpenSpecContinuousRunner.class), mock(ContinuousExecutionSkillProvisioner.class),
                new ObjectMapper(), mock(ApplicationEventPublisher.class));
    }

    private SessionAutopilotRun withIdentity(SessionAutopilotRun source, String id, String sessionId) {
        return new SessionAutopilotRun(id, sessionId, source.goal(), source.completionPolicy(), source.state(),
                source.reason(), source.context(), source.turnCount(), source.maxTurns(), source.noProgressCount(),
                source.maxNoProgress(), source.autoArchive(), source.skillActivated(), source.skillPath(),
                source.skillVersion(), source.skillFingerprint(), source.runtimeSupervision(),
                source.completedTasks(), source.totalTasks(), source.latestDisposition(), source.latestSummary(),
                source.latestNextAction(), source.latestRemainingWorkJson(), source.latestEvidenceJson(),
                source.latestReportAt(), source.startedAt(), source.deadlineAt(), source.updatedAt());
    }

    private SessionAutopilotRun run() {
        Instant now = Instant.now();
        OpenSpecExecutionContext context = new OpenSpecExecutionContext(
                "D:/repo", "D:/repo", "main", "workspace", "session-autopilot", "revision-a",
                "6.4", 28, OpenSpecExecutionPhase.APPLY, "codex-session-1", 1, 0);
        return new SessionAutopilotRun("run-1", "session-1", "完成 change",
                AutopilotCompletionPolicy.OPEN_SPEC_STRICT, AutopilotState.ACTIVE, null, context,
                0, 60, 0, 3, true, true, ".agents/skills", "1.0.0", "hash", true,
                0, 1, null, null, null, null, null, null, now, now.plusSeconds(3600), now);
    }
}
