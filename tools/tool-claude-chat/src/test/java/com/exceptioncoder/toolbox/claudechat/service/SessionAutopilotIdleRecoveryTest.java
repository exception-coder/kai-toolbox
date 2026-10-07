package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.QueuedChatMessage;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotCompletionPolicy;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotState;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAutopilotRepository;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.TaskSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionQueueReleaseRequestedEvent;
import com.exceptioncoder.toolbox.claudechat.service.governance.ProjectExecutionControlStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Exercise idle reconciliation through the same runner used by actual turn completion. */
class SessionAutopilotIdleRecoveryTest {
    @TempDir Path root;

    @Test
    void disabledGatesStopCompletedDevelopmentWithoutManufacturingAnotherTurn() {
        var f = fixture(false);

        f.service.reconcileActiveRuns();

        assertThat(f.state.get().state()).isEqualTo(AutopilotState.STOPPED);
        assertThat(f.state.get().turnCount()).isEqualTo(13);
        assertThat(f.state.get().completedTasks()).isEqualTo(1);
        assertThat(f.state.get().reason()).contains("未执行", "验收");
        verify(f.repository, never()).appendStep(any());
        verify(f.queue, never()).saveInternal(any(), any(), any(), any(), any(), any());
        verify(f.events, never()).publishEvent(any(SessionQueueReleaseRequestedEvent.class));
        verify(f.specs, never()).strictValidate(any(), any());
        verifyNoInteractions(f.quality);
    }

    @Test
    void completedDevelopmentDiscardsStaleInternalMessageButPreservesUserQueue() {
        var f = fixture(false);
        f.internalQueued.set(true);

        f.service.reconcileActiveRuns();

        assertThat(f.state.get().state()).isEqualTo(AutopilotState.STOPPED);
        verify(f.queue).delete("session", "autopilot:run:old");
        verify(f.queue, never()).delete("session", "user-followup");
        verify(f.queue, never()).clearInternal(any());
        verify(f.queue, never()).clear(any());
        verify(f.queue, never()).takeFirst(any());
        verify(f.events, never()).publishEvent(any(SessionQueueReleaseRequestedEvent.class));
    }

    @Test
    void completedApplyMovesToVerifyOnceWithoutRunningQualityGateDuringPolling() {
        var f = fixture(true);

        f.service.reconcileActiveRuns();
        f.service.reconcileActiveRuns();
        f.service.reconcileActiveRuns();

        assertThat(f.state.get().state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(f.state.get().context().phase()).isEqualTo(OpenSpecExecutionPhase.VERIFY);
        assertThat(f.state.get().context().currentTaskId()).isNull();
        assertThat(f.state.get().turnCount()).isEqualTo(13);
        verify(f.repository).update(any(), eq(0L));
        verify(f.repository, never()).appendStep(any());
        verify(f.queue).saveInternal(eq("session"), any(), any(), any(), any(), anyLong());
        verify(f.specs, never()).strictValidate(any(), any());
        verifyNoInteractions(f.quality);
    }

    @ParameterizedTest
    @ValueSource(strings = {"RUNNING", "AWAITING_DECISION", "BACKGROUND_RUNNING"})
    void nonIdleRuntimeDoesNotReadSpecsOrEnqueueContinuation(String runtimeState) {
        var f = fixture(false);
        when(f.runtime.canStartTurn("session")).thenReturn(
                new SessionRuntimeStateService.SendDecision(false, "CONSISTENT", runtimeState));

        f.service.reconcileActiveRuns();

        verifyNoInteractions(f.specs, f.quality, f.queue, f.events);
        verify(f.repository, never()).update(any(), anyLong());
        verify(f.repository, never()).advanceBatch(any(), anyLong(), anyInt());
        assertThat(f.state.get().turnCount()).isEqualTo(13);
    }

    @Test
    void completedChangeContinuesNextPendingChangeInOriginalBatchOrder() {
        var f = fixture(false);
        var batch = new SessionAutopilotRepository.Batch(
                "[\"account-management\",\"organization-management\",\"access-management\"]",
                "{\"organization-management\":\"revision-b\"}", 0);
        when(f.repository.findBatch("session", "run")).thenReturn(Optional.of(batch));
        var task = new TaskSnapshot("3.1", 1, "组织查询公开契约", false);
        when(f.specs.inspect(root, "organization-management")).thenReturn(
                new ChangeSnapshot("organization-management", "revision-b", 0, 1,
                        List.of(task), Map.of(), task));
        doAnswer(call -> {
            assertThat(call.<Long>getArgument(1)).isEqualTo(f.state.get().context().version());
            f.state.set(call.getArgument(0));
            return null;
        }).when(f.repository).advanceBatch(any(), anyLong(), anyInt());

        f.service.reconcileActiveRuns();

        assertThat(f.state.get().state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(f.state.get().context().changeId()).isEqualTo("organization-management");
        assertThat(f.state.get().context().currentTaskId()).isEqualTo("3.1");
        assertThat(f.state.get().turnCount()).isEqualTo(13);
        verify(f.repository).advanceBatch(any(), eq(0L), eq(0));
        verify(f.repository, never()).appendStep(any());
        var text = ArgumentCaptor.forClass(String.class);
        verify(f.queue).saveInternal(eq("session"), any(), text.capture(), any(), any(), anyLong());
        assertThat(text.getValue()).contains("organization-management", "3.1", "组织查询公开契约");
        var order = inOrder(f.specs);
        order.verify(f.specs).inspect(root, "account-management");
        order.verify(f.specs).inspect(root, "organization-management");
        verify(f.specs, never()).inspect(root, "access-management");
        verify(f.specs, never()).strictValidate(any(), any());
        verifyNoInteractions(f.quality);
    }

    @Test
    void rejectedStateVersionDoesNotClearOrReleaseQueueOrPublishSuccess() {
        var f = fixture(false);
        f.internalQueued.set(true);
        doReturn(false).when(f.repository).update(any(), anyLong());

        f.service.reconcileActiveRuns();

        assertThat(f.state.get().state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(f.state.get().turnCount()).isEqualTo(13);
        verify(f.repository).update(any(), eq(0L));
        verify(f.repository, never()).appendStep(any());
        verify(f.queue, never()).clearInternal(any());
        verify(f.queue, never()).clear(any());
        verify(f.queue, never()).delete(any(), any());
        verify(f.queue, never()).saveInternal(any(), any(), any(), any(), any(), any());
        verifyNoInteractions(f.events);
    }

    @Test
    void idleCompletionRetainsExistingTaskIdentityDriftProtection() {
        var f = fixture(true);
        when(f.specs.inspect(root, "account-management")).thenReturn(new ChangeSnapshot(
                "account-management", "revision-moved", 1, 1,
                List.of(new TaskSnapshot("2.1", 2, "任务编号已移动", true)), Map.of(), null));
        f.service.reconcileActiveRuns();
        assertThat(f.state.get().state()).isEqualTo(AutopilotState.PAUSED);
        assertThat(f.state.get().reason()).contains("序号发生漂移");
        assertThat(f.state.get().turnCount()).isEqualTo(13);
        verify(f.queue, never()).saveInternal(any(), any(), any(), any(), any(), any());
        verifyNoInteractions(f.quality);
    }

    @ParameterizedTest
    @EnumSource(value = OpenSpecExecutionPhase.class, names = {"VERIFY", "QUALITY_GATE", "STRICT_VALIDATE", "ARCHIVE"})
    void pollingLaterPhasesNeverExecutesVerificationOrArchive(OpenSpecExecutionPhase phase) {
        var f = fixture(true, phase);
        f.internalQueued.set(true);
        f.service.reconcileActiveRuns();
        f.service.reconcileActiveRuns();
        assertThat(f.state.get().context().phase()).isEqualTo(phase);
        assertThat(f.state.get().turnCount()).isEqualTo(13);
        verify(f.repository, never()).update(any(), anyLong());
        verify(f.repository, never()).advanceBatch(any(), anyLong(), anyInt());
        verifyNoInteractions(f.quality);
        verify(f.specs, times(2)).inspect(root, "account-management");
        verifyNoMoreInteractions(f.specs);
    }

    @Test
    void enablingGatesDuringIdleRecoveryRequiresNormalPreflightInsteadOfPollingValidation() {
        var f = fixture(false);
        when(f.repository.findBatch("session", "run")).thenReturn(Optional.of(
                new SessionAutopilotRepository.Batch("[\"account-management\",\"organization-management\"]",
                        "{\"organization-management\":\"revision-b\"}", 0)));
        var task = new TaskSnapshot("3.1", 1, "组织查询", false);
        when(f.specs.inspect(root, "organization-management")).thenReturn(new ChangeSnapshot(
                "organization-management", "revision-b", 0, 1, List.of(task), Map.of(), task));
        when(f.queue.list("session")).thenAnswer(call -> {
            ProjectExecutionControlStore.update(root, 1, true, "developer", "恢复门禁");
            return List.of();
        });
        doAnswer(call -> { f.state.set(call.getArgument(0)); return null; })
                .when(f.repository).advanceBatch(any(), anyLong(), anyInt());
        f.service.reconcileActiveRuns();
        assertThat(f.state.get().state()).isEqualTo(AutopilotState.WAITING_USER);
        assertThat(f.state.get().reason()).contains("编码门禁已开启", "恢复");
        assertThat(f.state.get().turnCount()).isEqualTo(13);
        verify(f.specs, never()).strictValidate(any(), any());
        verify(f.queue, never()).saveInternal(any(), any(), any(), any(), any(), any());
        verifyNoInteractions(f.quality);
    }

    private Fixture fixture(boolean gatesEnabled) {
        return fixture(gatesEnabled, OpenSpecExecutionPhase.APPLY);
    }

    private Fixture fixture(boolean gatesEnabled, OpenSpecExecutionPhase phase) {
        if (!gatesEnabled) {
            ProjectExecutionControlStore.update(root, 0, false, "developer", "controlled development");
        }
        var repository = mock(SessionAutopilotRepository.class);
        var queue = mock(QueuedChatMessageService.class);
        var specs = mock(OpenSpecAutopilotAdapter.class);
        var quality = mock(ForgeQualityGateAdapter.class);
        var runtime = mock(SessionRuntimeStateService.class);
        var events = mock(ApplicationEventPublisher.class);
        var now = Instant.now();
        var context = new OpenSpecExecutionContext(root.toString(), "repo", "main", "workspace",
                "account-management", "revision-a", phase == OpenSpecExecutionPhase.APPLY ? "2.1" : null,
                phase == OpenSpecExecutionPhase.APPLY ? 1 : null, phase, "thread", 1, 0);
        var state = new AtomicReference<>(new SessionAutopilotRun("run", "session", "完成账号管理",
                AutopilotCompletionPolicy.OPEN_SPEC_STRICT, AutopilotState.ACTIVE, null, context,
                13, 60, 4, 3, false, true, ".agents/skills", "1", "hash", true,
                0, 1, null, null, null, null, null, null, now, now.plusSeconds(3600), now));
        var internalQueued = new AtomicBoolean();
        var task = new TaskSnapshot("2.1", 1, "账号管理公开契约", true);
        when(specs.inspect(root, "account-management")).thenReturn(new ChangeSnapshot(
                "account-management", "revision-done", 1, 1, List.of(task), Map.of(), null));
        when(repository.findRecent("", null, null, 200)).thenAnswer(call -> List.of(state.get()));
        when(repository.findBySessionId("session")).thenAnswer(call -> Optional.of(state.get()));
        when(repository.update(any(), anyLong())).thenAnswer(call -> {
            if (state.get().context().version() != call.<Long>getArgument(1)) return false;
            state.set(call.getArgument(0));
            return true;
        });
        when(runtime.canStartTurn("session")).thenReturn(
                new SessionRuntimeStateService.SendDecision(true, "CONSISTENT", "IDLE"));
        when(queue.hasInternal("session")).thenAnswer(call -> internalQueued.get());
        var userMessage = new QueuedChatMessage("user-followup", "session", "下一步查看交付结果",
                null, null, List.of(), 1L);
        var staleContinuation = new QueuedChatMessage("autopilot:run:old", "session", "继续旧任务",
                null, null, List.of(), 2L, "old task context");
        when(queue.list("session")).thenAnswer(call -> internalQueued.get()
                ? List.of(userMessage, staleContinuation) : List.of(userMessage));
        when(queue.saveInternal(any(), any(), any(), any(), any(), anyLong())).thenAnswer(call -> {
            internalQueued.set(true);
            return null;
        });
        doAnswer(call -> { internalQueued.set(false); return null; })
                .when(queue).delete("session", "autopilot:run:old");
        var service = new SessionAutopilotService(repository, mock(ClaudeChatSessionRepository.class),
                mock(ClaudeChatSessionAccessPolicy.class), queue, runtime, mock(AutopilotProjectContextResolver.class),
                specs, new OpenSpecContinuousRunner(specs, quality), mock(ContinuousExecutionSkillProvisioner.class),
                new ObjectMapper(), events);
        return new Fixture(service, repository, queue, specs, quality, runtime, events, state, internalQueued);
    }

    private record Fixture(SessionAutopilotService service, SessionAutopilotRepository repository,
                           QueuedChatMessageService queue, OpenSpecAutopilotAdapter specs,
                           ForgeQualityGateAdapter quality, SessionRuntimeStateService runtime,
                           ApplicationEventPublisher events, AtomicReference<SessionAutopilotRun> state,
                           AtomicBoolean internalQueued) { }
}
