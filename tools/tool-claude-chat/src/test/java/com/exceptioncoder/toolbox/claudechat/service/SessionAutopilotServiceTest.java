package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotCompletionPolicy;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotDisposition;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotState;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionRuntimeStateView;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAutopilotRepository;
import com.exceptioncoder.toolbox.claudechat.service.ContinuousExecutionSkillProvisioner.ProvisioningResult;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeOption;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.TaskSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionTurnSettledEvent;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionManualInputEvent;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionQueueReleaseRequestedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionAutopilotServiceTest {

    @Test
    void waitingBatchItemDefersQuestionAndDispatchesValidatedNextChange() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
        SessionAutopilotRun base = run();
        SessionAutopilotRun reported = new SessionAutopilotRun(base.id(), base.sessionId(), base.goal(),
                base.completionPolicy(), base.state(), base.reason(), base.context(), base.turnCount(),
                base.maxTurns(), base.noProgressCount(), base.maxNoProgress(), base.autoArchive(),
                base.skillActivated(), base.skillPath(), base.skillVersion(), base.skillFingerprint(),
                base.runtimeSupervision(), base.completedTasks(), base.totalTasks(),
                AutopilotDisposition.WAITING_USER, "V090 尚未独立提交", null, "[]", "[]",
                Instant.now(), base.startedAt(), base.deadlineAt(), base.updatedAt());
        var batch = new SessionAutopilotRepository.Batch(
                "[\"session-autopilot\",\"organization\"]",
                "{\"organization\":\"rev-b\"}", 0);
        TaskSnapshot task = new TaskSnapshot("2.1", 1, "next", false);
        var nextSnapshot = new ChangeSnapshot("organization", "rev-b", 0, 1,
                List.of(task), Map.of(), task);
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(reported));
        when(repository.findBatch("session-1", "run-1")).thenReturn(Optional.of(batch));
        when(repository.findDeferredChanges("run-1")).thenReturn(List.of());
        when(openSpec.inspect(java.nio.file.Path.of("D:/repo"), "organization"))
                .thenReturn(nextSnapshot);
        when(openSpec.strictValidate(java.nio.file.Path.of("D:/repo"), "organization"))
                .thenReturn(new OpenSpecAutopilotAdapter.ValidationResult(true, "valid"));
        when(repository.deferBatch(any(), any(), eq(0L), eq(batch), any(), any()))
                .thenReturn(true);
        var service = new SessionAutopilotService(repository, mock(ClaudeChatSessionRepository.class),
                mock(ClaudeChatSessionAccessPolicy.class), queue, mock(SessionRuntimeStateService.class),
                mock(AutopilotProjectContextResolver.class), openSpec,
                mock(OpenSpecContinuousRunner.class), mock(ContinuousExecutionSkillProvisioner.class),
                new ObjectMapper(), mock(ApplicationEventPublisher.class));

        service.onSettled(new SessionTurnSettledEvent("session-1", "turn-waiting", "end_turn", true,
                System.currentTimeMillis()));

        ArgumentCaptor<SessionAutopilotRun> saved = ArgumentCaptor.forClass(SessionAutopilotRun.class);
        verify(repository, timeout(3000)).deferBatch(any(), saved.capture(), eq(0L), eq(batch),
                eq("[\"organization\",\"session-autopilot\"]"), any());
        assertThat(saved.getValue().state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(saved.getValue().context().changeId()).isEqualTo("organization");
        verify(queue, timeout(3000)).saveInternal(eq("session-1"), any(), any(), any(), any(), anyLong());
    }

    @Test
    void batchStartPreflightsEveryChangeBeforePersistingTheOrderedPlan() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        AutopilotProjectContextResolver projects = mock(AutopilotProjectContextResolver.class);
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        ContinuousExecutionSkillProvisioner skill = mock(ContinuousExecutionSkillProvisioner.class);
        var root = java.nio.file.Path.of("D:/repo");
        when(projects.resolve("session-1", "D:/repo")).thenReturn(
                new AutopilotProjectContextResolver.ProjectIdentity(root, "repository", "main", "workspace", "agent"));
        when(repository.findBySessionId("session-1")).thenReturn(Optional.empty());
        when(openSpec.listChanges(root)).thenReturn(List.of(
                new ChangeOption("first", 0, 1, "now"), new ChangeOption("second", 0, 1, "now")));
        for (String id : List.of("first", "second")) {
            var task = new TaskSnapshot("1.1", 1, "next", false);
            when(openSpec.inspect(root, id)).thenReturn(new ChangeSnapshot(id, "rev-" + id, 0, 1,
                    List.of(task), Map.of(), task));
            when(openSpec.strictValidate(root, id)).thenReturn(
                    new OpenSpecAutopilotAdapter.ValidationResult(true, "valid"));
        }
        when(skill.provision(root)).thenReturn(new ProvisioningResult("1", "hash", List.of(), List.of()));
        var service = new SessionAutopilotService(repository, mock(ClaudeChatSessionRepository.class),
                mock(ClaudeChatSessionAccessPolicy.class), mock(QueuedChatMessageService.class),
                mock(SessionRuntimeStateService.class), projects, openSpec,
                mock(OpenSpecContinuousRunner.class), skill, new ObjectMapper(), mock(ApplicationEventPublisher.class));

        service.start("session-1", new SessionAutopilotService.StartRequest("D:/repo", "first", "goal", true,
                60, 3, 240, "rev-first", List.of("first", "second"),
                Map.of("first", "rev-first", "second", "rev-second")));

        verify(repository).saveBatch(eq("session-1"), any(), eq("[\"first\",\"second\"]"),
                any());
        verify(openSpec).strictValidate(root, "second");
        assertThatThrownBy(() -> service.start("session-1", new SessionAutopilotService.StartRequest(
                "D:/repo", "first", "goal", true, 60, 3, 240, "rev-first",
                List.of("first", "second"), Map.of("first", "rev-first", "second", "stale"))))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("second 已变化");
    }

    @Test
    void completedBatchItemRechecksAndDispatchesTheNextChange() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        OpenSpecContinuousRunner runner = mock(OpenSpecContinuousRunner.class);
        QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
        SessionAutopilotRun current = run();
        var root = java.nio.file.Path.of("D:/repo");
        var done = new OpenSpecExecutionContext("D:/repo", "D:/repo", "main", "workspace",
                "session-autopilot", "revision-a", null, null, OpenSpecExecutionPhase.DONE,
                "codex-session-1", 1, 1);
        var nextTask = new TaskSnapshot("2.1", 1, "next", false);
        var first = new ChangeSnapshot("session-autopilot", "revision-a", 1, 1,
                List.of(new TaskSnapshot("6.4", 28, "done", true)), Map.of(), null);
        var second = new ChangeSnapshot("second", "revision-b", 0, 1,
                List.of(nextTask), Map.of(), nextTask);
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(current));
        when(repository.findBatch("session-1", "run-1")).thenReturn(Optional.of(
                new SessionAutopilotRepository.Batch("[\"session-autopilot\",\"second\"]",
                        "{\"session-autopilot\":\"revision-a\",\"second\":\"revision-b\"}", 0)));
        when(repository.appendStep(any())).thenReturn(true);
        when(openSpec.inspect(root, "session-autopilot")).thenReturn(first);
        when(openSpec.inspect(root, "second")).thenReturn(second);
        when(openSpec.strictValidate(root, "second")).thenReturn(
                new OpenSpecAutopilotAdapter.ValidationResult(true, "valid"));
        when(runner.decide(eq(current), eq(first))).thenReturn(new OpenSpecContinuousRunner.Decision(
                AutopilotState.COMPLETED, "DONE", "finished", done, 0, null, "fingerprint"));
        var service = new SessionAutopilotService(repository, mock(ClaudeChatSessionRepository.class),
                mock(ClaudeChatSessionAccessPolicy.class), queue, mock(SessionRuntimeStateService.class),
                mock(AutopilotProjectContextResolver.class), openSpec, runner,
                mock(ContinuousExecutionSkillProvisioner.class), new ObjectMapper(), mock(ApplicationEventPublisher.class));

        service.onSettled(new SessionTurnSettledEvent("session-1", "turn-9", "end_turn", true,
                System.currentTimeMillis()));

        ArgumentCaptor<SessionAutopilotRun> saved = ArgumentCaptor.forClass(SessionAutopilotRun.class);
        verify(repository, timeout(2_000)).advanceBatch(saved.capture(), eq(0L), eq(0));
        assertThat(saved.getValue().context().changeId()).isEqualTo("second");
        assertThat(saved.getValue().state()).isEqualTo(AutopilotState.ACTIVE);
        verify(queue, timeout(2_000)).saveInternal(eq("session-1"), any(), any(), any(), any(), anyLong());
    }

    @Test
    void completedBatchStopsBeforePreviouslyDeferredChangeUntilReply() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        OpenSpecContinuousRunner runner = mock(OpenSpecContinuousRunner.class);
        QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
        SessionAutopilotRun current = run();
        var root = java.nio.file.Path.of("D:/repo");
        var done = new OpenSpecExecutionContext("D:/repo", "D:/repo", "main", "workspace",
                "session-autopilot", "revision-a", null, null, OpenSpecExecutionPhase.DONE,
                "codex-session-1", 1, 1);
        var first = new ChangeSnapshot("session-autopilot", "revision-a", 1, 1,
                List.of(new TaskSnapshot("6.4", 28, "done", true)), Map.of(), null);
        var task = new TaskSnapshot("2.1", 1, "next", false);
        var deferredSnapshot = new ChangeSnapshot("deferred", "revision-b", 0, 1,
                List.of(task), Map.of(), task);
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(current));
        when(repository.findBatch("session-1", "run-1")).thenReturn(Optional.of(
                new SessionAutopilotRepository.Batch("[\"session-autopilot\",\"deferred\"]",
                        "{\"deferred\":\"revision-b\"}", 0)));
        when(repository.findDeferredChanges("run-1")).thenReturn(List.of(
                new SessionAutopilotRepository.DeferredChange("deferred", "等待 V090 前置提交")));
        when(repository.appendStep(any())).thenReturn(true);
        when(openSpec.inspect(root, "session-autopilot")).thenReturn(first);
        when(openSpec.inspect(root, "deferred")).thenReturn(deferredSnapshot);
        when(openSpec.strictValidate(root, "deferred"))
                .thenReturn(new OpenSpecAutopilotAdapter.ValidationResult(true, "valid"));
        when(runner.decide(eq(current), eq(first))).thenReturn(new OpenSpecContinuousRunner.Decision(
                AutopilotState.COMPLETED, "DONE", "finished", done, 0, null, "fingerprint"));
        var service = new SessionAutopilotService(repository, mock(ClaudeChatSessionRepository.class),
                mock(ClaudeChatSessionAccessPolicy.class), queue, mock(SessionRuntimeStateService.class),
                mock(AutopilotProjectContextResolver.class), openSpec, runner,
                mock(ContinuousExecutionSkillProvisioner.class), new ObjectMapper(), mock(ApplicationEventPublisher.class));

        service.onSettled(new SessionTurnSettledEvent("session-1", "turn-9", "end_turn", true,
                System.currentTimeMillis()));

        ArgumentCaptor<SessionAutopilotRun> saved = ArgumentCaptor.forClass(SessionAutopilotRun.class);
        verify(repository, timeout(2_000)).advanceBatch(saved.capture(), eq(0L), eq(0));
        assertThat(saved.getValue().state()).isEqualTo(AutopilotState.WAITING_USER);
        assertThat(saved.getValue().reason()).contains("等待 V090 前置提交");
        verify(queue, never()).saveInternal(any(), any(), any(), any(), any(), anyLong());
    }

    @Test
    void changedNextRevisionWaitsForUserInsteadOfDispatching() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        OpenSpecContinuousRunner runner = mock(OpenSpecContinuousRunner.class);
        QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
        SessionAutopilotRun current = run();
        var root = java.nio.file.Path.of("D:/repo");
        var first = new ChangeSnapshot("session-autopilot", "revision-a", 1, 1,
                List.of(new TaskSnapshot("6.4", 28, "done", true)), Map.of(), null);
        var task = new TaskSnapshot("2.1", 1, "next", false);
        var changed = new ChangeSnapshot("second", "revision-changed", 0, 1,
                List.of(task), Map.of(), task);
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(current));
        when(repository.findBatch("session-1", "run-1")).thenReturn(Optional.of(
                new SessionAutopilotRepository.Batch("[\"session-autopilot\",\"second\"]",
                        "{\"second\":\"revision-original\"}", 0)));
        when(repository.appendStep(any())).thenReturn(true);
        when(openSpec.inspect(root, "session-autopilot")).thenReturn(first);
        when(openSpec.inspect(root, "second")).thenReturn(changed);
        when(openSpec.strictValidate(root, "second")).thenReturn(
                new OpenSpecAutopilotAdapter.ValidationResult(true, "valid"));
        when(runner.decide(eq(current), eq(first))).thenReturn(new OpenSpecContinuousRunner.Decision(
                AutopilotState.COMPLETED, "DONE", "finished", current.context(), 0, null, "fingerprint"));
        var service = new SessionAutopilotService(repository, mock(ClaudeChatSessionRepository.class),
                mock(ClaudeChatSessionAccessPolicy.class), queue, mock(SessionRuntimeStateService.class),
                mock(AutopilotProjectContextResolver.class), openSpec, runner,
                mock(ContinuousExecutionSkillProvisioner.class), new ObjectMapper(), mock(ApplicationEventPublisher.class));

        service.onSettled(new SessionTurnSettledEvent("session-1", "turn-10", "end_turn", true,
                System.currentTimeMillis()));

        ArgumentCaptor<SessionAutopilotRun> saved = ArgumentCaptor.forClass(SessionAutopilotRun.class);
        verify(repository, timeout(2_000)).advanceBatch(saved.capture(), eq(0L), eq(0));
        assertThat(saved.getValue().state()).isEqualTo(AutopilotState.WAITING_USER);
        assertThat(saved.getValue().reason()).contains("规格已变化");
        verify(queue, never()).saveInternal(any(), any(), any(), any(), any(), anyLong());
    }

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
        when(openSpec.strictValidate(identity.projectRoot(), "session-autopilot"))
                .thenReturn(new OpenSpecAutopilotAdapter.ValidationResult(true, "valid"));
        when(skill.provision(identity.projectRoot())).thenReturn(new ProvisioningResult("1.0.0", "hash",
                List.of(".claude/skills/forge/SKILL.md", ".agents/skills/forge/SKILL.md"), List.of()));
        when(repository.findBySessionId("session-1")).thenReturn(Optional.empty());
        SessionAutopilotService service = new SessionAutopilotService(repository,
                mock(ClaudeChatSessionRepository.class), mock(ClaudeChatSessionAccessPolicy.class), queue,
                mock(SessionRuntimeStateService.class), projects, openSpec, mock(OpenSpecContinuousRunner.class),
                skill, new ObjectMapper(), mock(ApplicationEventPublisher.class));

        var view = service.start("session-1", new SessionAutopilotService.StartRequest(
                "D:/repo", "session-autopilot", "完成 change", true, 8, 3, 240, "revision-a"));

        ArgumentCaptor<SessionAutopilotRun> saved = ArgumentCaptor.forClass(SessionAutopilotRun.class);
        verify(repository).replace(saved.capture());
        assertThat(saved.getValue().context().currentTaskId()).isEqualTo("1.2");
        assertThat(saved.getValue().context().currentTaskOrdinal()).isEqualTo(2);
        assertThat(saved.getValue().context().agentSessionRef()).isEqualTo("agent-session");
        assertThat(view.state()).isEqualTo("ACTIVE");
        ArgumentCaptor<String> messageId = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> instructions = ArgumentCaptor.forClass(String.class);
        verify(queue).saveInternal(eq("session-1"), messageId.capture(), any(), any(),
                instructions.capture(), anyLong());
        assertThat(messageId.getValue()).isEqualTo("autopilot:" + saved.getValue().id() + ":1:apply:1.2:0");
        assertThat(instructions.getValue()).contains("Runtime run ID:", "execution=null",
                "discover_execution", "assess_execution", "session-autopilot", saved.getValue().id());
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(saved.getValue()));
        assertThat(service.tasks("session-1")).extracting(TaskSnapshot::id)
                .containsExactly("1.1", "1.2");
        when(repository.findBySessionId("session-1")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.start("session-1", new SessionAutopilotService.StartRequest(
                "D:/repo", "session-autopilot", "完成 change", true, 8, 3, 240, "stale")))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("重新预检");
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
        when(repository.findRecentByStates("", null, null, 200, List.of(
                AutopilotState.ACTIVE, AutopilotState.WAITING_USER, AutopilotState.FAILED,
                AutopilotState.PAUSED, AutopilotState.COMPLETED, AutopilotState.STOPPED)))
                .thenReturn(List.of(visible, hidden));
        when(repository.findRecentByStates("", null, null, 50, List.of(AutopilotState.ACTIVE)))
                .thenReturn(List.of(visible, hidden));
        when(access.canAccessCurrentUser("session-1")).thenReturn(true);
        when(access.canAccessCurrentUser("session-2")).thenReturn(false);

        var dashboard = service.dashboard("active", "", null, 30);

        assertThat(dashboard.items()).extracting(item -> item.run().sessionId())
                .containsExactly("session-1");
        assertThat(dashboard.counts().active()).isEqualTo(1);
        when(repository.findRecentByStates("", null, null, 50, List.of(
                AutopilotState.ACTIVE, AutopilotState.WAITING_USER, AutopilotState.FAILED,
                AutopilotState.PAUSED, AutopilotState.COMPLETED, AutopilotState.STOPPED)))
                .thenReturn(List.of(visible, hidden));
        assertThat(service.dashboard("all", "", null, 30).items())
                .extracting(item -> item.run().sessionId()).containsExactly("session-1");
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
    void capacityFailureKeepsSupervisionActiveForBoundedBackendRetry() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(run()));
        when(repository.appendStep(any())).thenReturn(true);
        when(repository.update(any(), eq(0L))).thenReturn(true);
        SessionAutopilotService service = new SessionAutopilotService(repository,
                mock(ClaudeChatSessionRepository.class), mock(ClaudeChatSessionAccessPolicy.class), queue,
                mock(SessionRuntimeStateService.class), mock(AutopilotProjectContextResolver.class),
                mock(OpenSpecAutopilotAdapter.class), mock(OpenSpecContinuousRunner.class),
                mock(ContinuousExecutionSkillProvisioner.class), new ObjectMapper(),
                mock(ApplicationEventPublisher.class));

        service.onSettled(new SessionTurnSettledEvent("session-1", "capacity-1", "failed", false,
                System.currentTimeMillis(), "CODEX_APP_SERVER_TURN_FAILED",
                "Selected model is at capacity. Please try a different model."));

        ArgumentCaptor<SessionAutopilotRun> saved = ArgumentCaptor.forClass(SessionAutopilotRun.class);
        verify(repository, timeout(2_000)).update(saved.capture(), eq(0L));
        assertThat(saved.getValue().state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(saved.getValue().reason()).contains("1/3");
        verify(queue, never()).saveInternal(any(), any(), any(), any(), any(), anyLong());
    }

    @Test
    void unrelatedFailureStillPausesSupervision() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(run()));
        when(repository.appendStep(any())).thenReturn(true);
        when(repository.update(any(), eq(0L))).thenReturn(true);
        SessionAutopilotService service = service(repository, mock(ClaudeChatSessionRepository.class),
                mock(ClaudeChatSessionAccessPolicy.class));

        service.onSettled(new SessionTurnSettledEvent("session-1", "failure-1", "failed", false,
                System.currentTimeMillis(), "CODEX_APP_SERVER_TURN_FAILED", "tool write failed"));

        ArgumentCaptor<SessionAutopilotRun> saved = ArgumentCaptor.forClass(SessionAutopilotRun.class);
        verify(repository, timeout(2_000)).update(saved.capture(), eq(0L));
        assertThat(saved.getValue().state()).isEqualTo(AutopilotState.PAUSED);
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
    void reconciliationRetriesReleaseOfAnAlreadyQueuedAutopilotTurn() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
        SessionRuntimeStateService runtime = mock(SessionRuntimeStateService.class);
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        when(repository.findRecent("", null, null, 200)).thenReturn(List.of(run()));
        when(queue.hasInternal("session-1")).thenReturn(true);
        when(runtime.canStartTurn("session-1"))
                .thenReturn(new SessionRuntimeStateService.SendDecision(true, "CONSISTENT", null));
        SessionAutopilotService service = new SessionAutopilotService(repository,
                mock(ClaudeChatSessionRepository.class), mock(ClaudeChatSessionAccessPolicy.class), queue,
                runtime, mock(AutopilotProjectContextResolver.class), openSpec,
                mock(OpenSpecContinuousRunner.class), mock(ContinuousExecutionSkillProvisioner.class),
                new ObjectMapper(), events);

        service.reconcileActiveRuns();

        verify(events).publishEvent(new SessionQueueReleaseRequestedEvent("session-1"));
        verify(openSpec, never()).inspect(any(), any());
        verify(queue, never()).saveInternal(any(), any(), any(), any(), any(), anyLong());
    }

    @Test
    void pauseResumeAndStopAreVersionedAndResumeCreatesANewGeneration() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        ContinuousExecutionSkillProvisioner skill = mock(ContinuousExecutionSkillProvisioner.class);
        SessionAutopilotRun active = run();
        ChangeSnapshot snapshot = new ChangeSnapshot("session-autopilot", "revision-b", 0, 1,
                List.of(new TaskSnapshot("6.4", 28, "pending", false)), Map.of(),
                new TaskSnapshot("6.4", 28, "pending", false));
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(active));
        when(repository.update(any(), eq(0L))).thenReturn(true);
        when(openSpec.inspect(java.nio.file.Path.of("D:/repo"), "session-autopilot")).thenReturn(snapshot);
        when(skill.provision(java.nio.file.Path.of("D:/repo"))).thenReturn(new ProvisioningResult(
                "1.0.1", "updated-hash", List.of(".claude/skills/forge/SKILL.md",
                ".agents/skills/forge/SKILL.md"), List.of()));
        SessionAutopilotService service = new SessionAutopilotService(repository,
                mock(ClaudeChatSessionRepository.class), mock(ClaudeChatSessionAccessPolicy.class), queue,
                mock(SessionRuntimeStateService.class), mock(AutopilotProjectContextResolver.class), openSpec,
                mock(OpenSpecContinuousRunner.class), skill,
                new ObjectMapper(), mock(ApplicationEventPublisher.class));

        assertThat(service.action("session-1", "pause", 0).state()).isEqualTo("PAUSED");
        assertThat(service.action("session-1", "stop", 0).state()).isEqualTo("STOPPED");
        var resumed = service.action("session-1", "resume", 0);

        assertThat(resumed.state()).isEqualTo("ACTIVE");
        assertThat(resumed.generation()).isEqualTo(2);
        assertThat(resumed.currentTaskId()).isEqualTo("6.4");
        ArgumentCaptor<SessionAutopilotRun> updated = ArgumentCaptor.forClass(SessionAutopilotRun.class);
        verify(repository, atLeastOnce()).update(updated.capture(), eq(0L));
        assertThat(updated.getValue().skillVersion()).isEqualTo("1.0.1");
        assertThat(updated.getValue().skillActivated()).isFalse();
    }

    @Test
    void resumeArchivedChangeWithoutInspectingMissingActiveChange() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        ContinuousExecutionSkillProvisioner skill = mock(ContinuousExecutionSkillProvisioner.class);
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
        when(skill.provision(java.nio.file.Path.of("D:/repo"))).thenReturn(new ProvisioningResult(
                "1.0.1", "updated-hash", List.of(".claude/skills/forge/SKILL.md",
                ".agents/skills/forge/SKILL.md"), List.of()));
        SessionAutopilotService service = new SessionAutopilotService(repository,
                mock(ClaudeChatSessionRepository.class), mock(ClaudeChatSessionAccessPolicy.class), queue,
                mock(SessionRuntimeStateService.class), mock(AutopilotProjectContextResolver.class), openSpec,
                mock(OpenSpecContinuousRunner.class), skill,
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

    @Test
    void waitingRunRejectsProgressWithRecoverableConflictInsteadOfServerError() {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        SessionAutopilotRun waiting = withState(run(), AutopilotState.WAITING_USER);
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(waiting));
        SessionAutopilotService service = service(repository,
                mock(ClaudeChatSessionRepository.class), mock(ClaudeChatSessionAccessPolicy.class));

        assertThatThrownBy(() -> service.reportProgress("session-1",
                new SessionAutopilotService.ProgressReport("CONTINUE", "local work", "check build",
                        List.of("MySQL validation pending"), List.of(), null)))
                .isInstanceOfSatisfying(AutopilotProgressConflictException.class, conflict -> {
                    assertThat(conflict.state()).isEqualTo(AutopilotState.WAITING_USER);
                    assertThat(conflict.version()).isZero();
                });
        verify(repository, never()).update(any(), anyLong());
    }

    @Test
    void activeTurnCanResumeWaitingRunWhileRetainingDeferredVerification() throws Exception {
        SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
        SessionAutopilotRun waiting = withState(run(), AutopilotState.WAITING_USER);
        SessionRuntimeStateService runtime = mock(SessionRuntimeStateService.class);
        SessionRuntimeStateView observed = mock(SessionRuntimeStateView.class);
        when(observed.stale()).thenReturn(false);
        when(observed.sidecarActive()).thenReturn(true);
        when(observed.pendingDecision()).thenReturn(false);
        when(runtime.inspect("session-1")).thenReturn(Optional.of(observed));
        when(repository.findBySessionId("session-1")).thenReturn(Optional.of(waiting));
        when(repository.update(any(), eq(0L))).thenReturn(true);
        SessionAutopilotService service = new SessionAutopilotService(repository,
                mock(ClaudeChatSessionRepository.class), mock(ClaudeChatSessionAccessPolicy.class),
                mock(QueuedChatMessageService.class), runtime, mock(AutopilotProjectContextResolver.class),
                mock(OpenSpecAutopilotAdapter.class), mock(OpenSpecContinuousRunner.class),
                mock(ContinuousExecutionSkillProvisioner.class), new ObjectMapper(),
                mock(ApplicationEventPublisher.class));

        service.reportProgress("session-1", new SessionAutopilotService.ProgressReport(
                "CONTINUE", "main app packaging passed", "finish migration manifest",
                List.of("MySQL/MariaDB verification not run"), List.of("package passed"), null));

        ArgumentCaptor<SessionAutopilotRun> saved = ArgumentCaptor.forClass(SessionAutopilotRun.class);
        verify(repository).update(saved.capture(), eq(0L));
        assertThat(saved.getValue().state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(saved.getValue().context().currentTaskId()).isEqualTo("6.4");
        assertThat(saved.getValue().completedTasks()).isZero();
        assertThat(saved.getValue().latestRemainingWorkJson()).contains("MySQL/MariaDB verification not run");
    }

    private SessionAutopilotRun withState(SessionAutopilotRun source, AutopilotState state) {
        return new SessionAutopilotRun(source.id(), source.sessionId(), source.goal(), source.completionPolicy(), state,
                source.reason(), source.context(), source.turnCount(), source.maxTurns(), source.noProgressCount(),
                source.maxNoProgress(), source.autoArchive(), source.skillActivated(), source.skillPath(),
                source.skillVersion(), source.skillFingerprint(), source.runtimeSupervision(),
                source.completedTasks(), source.totalTasks(), source.latestDisposition(), source.latestSummary(),
                source.latestNextAction(), source.latestRemainingWorkJson(), source.latestEvidenceJson(),
                source.latestReportAt(), source.startedAt(), source.deadlineAt(), source.updatedAt());
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
