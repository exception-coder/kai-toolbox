package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.QueuedChatMessage;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.*;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAutopilotRepository;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import com.exceptioncoder.toolbox.claudechat.service.governance.ProjectExecutionControlStore;
import com.exceptioncoder.toolbox.claudechat.service.governance.VerificationCadence;
import org.springframework.context.ApplicationEventPublisher;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RequirementAutopilotServiceTest {
    private final SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
    private final QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
    private final OpenSpecAutopilotAdapter specs = mock(OpenSpecAutopilotAdapter.class);
    private final ContinuousExecutionSkillProvisioner skills = mock(ContinuousExecutionSkillProvisioner.class);
    private final SessionRuntimeStateService runtime = mock(SessionRuntimeStateService.class);
    private final AtomicReference<SessionAutopilotRun> state = new AtomicReference<>();
    private final Set<String> steps = ConcurrentHashMap.newKeySet();
    private final AtomicReference<AutopilotStep> lastStep = new AtomicReference<>();
    private SessionAutopilotService service;
    private final AutopilotProjectContextResolver resolver = mock(AutopilotProjectContextResolver.class);
    @TempDir Path project;

    @BeforeEach
    void setUp() {
        when(resolver.resolve("session-1", "D:/repo")).thenReturn(
                new AutopilotProjectContextResolver.ProjectIdentity(Path.of("D:/repo"), "repo", "main", "fp", "thread"));
        when(repository.findBySessionId("session-1")).thenAnswer(call -> Optional.ofNullable(state.get()));
        doAnswer(call -> { state.set(call.getArgument(0)); return null; }).when(repository).replace(any());
        when(repository.update(any(), anyLong())).thenAnswer(call -> {
            var old = state.get();
            if (old.context().version() != (long) call.getArgument(1)) return false;
            return state.compareAndSet(old, call.getArgument(0));
        });
        when(repository.appendStep(any())).thenAnswer(call -> {
            AutopilotStep step = call.getArgument(0);
            boolean inserted = steps.add(step.runId() + ":" + step.generation() + ":" + step.predecessorTurnId());
            if (inserted) lastStep.set(step);
            return inserted;
        });
        when(repository.findLatestStep(anyString(), anyLong())).thenAnswer(call ->
                Optional.ofNullable(lastStep.get()).filter(step -> step.generation() == (long) call.getArgument(1)));
        when(repository.recordOutcomeCheck(any(), any(), anyLong())).thenAnswer(call -> {
            SessionAutopilotRun next = call.getArgument(1);
            if (state.get().context().version() != (long) call.getArgument(2)) return false;
            if (!repository.appendStep(call.getArgument(0))) return false;
            state.set(next);
            return true;
        });
        service = new SessionAutopilotService(repository, mock(ClaudeChatSessionRepository.class),
                mock(ClaudeChatSessionAccessPolicy.class), queue, runtime, resolver, specs,
                mock(OpenSpecContinuousRunner.class), skills, new ObjectMapper(), mock(ApplicationEventPublisher.class));
    }

    private SessionAutopilotService.StartRequest request(String goal, int turns) {
        return new SessionAutopilotService.StartRequest("D:/repo", null, goal, true, turns, 3, 60,
                null, null, null, AutopilotCompletionPolicy.REQUIREMENT_BEST_EFFORT);
    }

    @Test
    void codingFirstControlDefersVerificationAndRejectsCompletion() {
        when(resolver.resolve("session-1", "D:/repo")).thenReturn(
                new AutopilotProjectContextResolver.ProjectIdentity(project, "repo", "main", "fp", "thread"));
        ProjectExecutionControlStore.update(project, 0, true, "test-user", "编码后集中验收", VerificationCadence.CODING_FIRST);
        service.start("session-1", request("修复菜单", 60));
        assertThat(RequirementAutopilot.handoff(state.get(), state.get()).instructions())
                .contains("编码优先", "报告 WAITING_USER");
        assertThatThrownBy(() -> service.reportProgress("session-1", report("COMPLETE", List.of(), List.of("代码已写入"))))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("编码优先");
        verifyNoInteractions(specs, skills);
    }

    @Test
    void duplicateSettlementCannotDispatchTwiceAndFailedTurnCannotComplete() {
        service.start("session-1", request("修复菜单", 60));
        service.reportProgress("session-1", report("CONTINUE", List.of("验证菜单"), List.of("已实现菜单")));
        var before = state.get();
        var event = new SessionTurnSettledEvent("session-1", "same-turn", "completed", true, Instant.now().toEpochMilli());
        clearInvocations(queue);
        service.evaluateSettled(before, event);
        service.evaluateSettled(before, event);
        assertThat(state.get().turnCount()).isEqualTo(1);
        verify(queue, times(1)).saveInternal(anyString(), anyString(), anyString(), anyString(), anyString(), anyLong());
        service.reportProgress("session-1", report("COMPLETE", List.of(), List.of("菜单回归通过")));
        service.evaluateSettled(state.get(), new SessionTurnSettledEvent("session-1", "failed-turn", "error", false, Instant.now().toEpochMilli()));
        assertThat(state.get().state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(state.get().reason()).contains("完成核对 1/3");
    }

    @Test
    void startsWithoutSpecAndRetryReusesActiveRunButCannotReplaceAnotherGoal() {
        var first = service.start("session-1", request("完成移动菜单", 60));
        var duplicate = service.start("session-1", request("完成移动菜单", 60));
        assertThat(duplicate.id()).isEqualTo(first.id());
        assertThat(first.autoArchive()).isFalse();
        assertThat(first.artifactPaths()).isEmpty();
        assertThat(first.layers().agentSkillProvisioned()).isFalse();
        verify(queue, times(1)).saveInternal(eq("session-1"), anyString(), anyString(), anyString(),
                contains("不等于平台严格规格验收"), anyLong());
        assertThatThrownBy(() -> service.start("session-1", request("另一需求", 60)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("已有监督");
        assertThatThrownBy(() -> service.start("session-1", request(" ", 60)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.start("session-1", request("字".repeat(2001), 60)))
                .isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(specs, skills);
    }

    @Test
    void rejectsPrematureCompletionThenKeepsEvidenceForReviewAfterSuccessfulSettlement() {
        service.start("session-1", request("修复并验证菜单", 60));
        for (var report : List.of(
                report("COMPLETE", null, List.of()),
                report("COMPLETE", List.of("待验证"), List.of("修改了代码")),
                report("COMPLETE", List.of(), List.of()))) {
            assertThatThrownBy(() -> service.reportProgress("session-1", report))
                    .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("验证证据");
        }
        service.reportProgress("session-1", report("COMPLETE", List.of(), List.of("菜单回归通过 3 项")));
        settle("turn-1");
        assertThat(state.get().state()).isEqualTo(AutopilotState.COMPLETED);
        assertThat(state.get().context().phase()).isEqualTo(OpenSpecExecutionPhase.DONE);
        assertThat(state.get().reason()).contains("Agent 自验", "未执行 OpenSpec 严格验收");
        assertThat(service.current("session-1").orElseThrow().latestReport().evidence())
                .containsExactly("菜单回归通过 3 项");
        verifyNoInteractions(specs, skills);
    }

    @Test
    void repeatedEvidencePausesRatherThanLoopingAndBudgetResetPreservesIdentity() {
        service.start("session-1", request("实现菜单", 20));
        for (int index = 0; index < 7; index++) {
            service.reportProgress("session-1", report("CONTINUE", List.of("完成菜单"), index % 2 == 0
                    ? List.of("同一项测试通过", "已有实现") : List.of(" 已有实现 ", "同一项测试通过")));
            settle("turn-" + index);
        }
        assertThat(state.get().state()).isEqualTo(AutopilotState.PAUSED);
        assertThat(state.get().noProgressCount()).isEqualTo(3);
        var paused = state.get();
        var resumed = service.action("session-1", "reset-budget", paused.context().version());
        assertThat(resumed.state()).isEqualTo("ACTIVE");
        assertThat(resumed.id()).isEqualTo(paused.id());
        assertThat(resumed.generation()).isEqualTo(paused.context().generation() + 1);
        assertThat(resumed.turnCount()).isZero();
        verifyNoInteractions(specs, skills);
    }

    @Test
    void missingReportCannotCompleteAndTurnBudgetStopsDispatch() {
        service.start("session-1", request("实现菜单", 1));
        clearInvocations(queue);
        settle("turn-1");
        assertThat(state.get().state()).isEqualTo(AutopilotState.PAUSED);
        assertThat(state.get().reason()).contains("TURN_LIMIT_REACHED");
        verify(queue, never()).saveInternal(anyString(), anyString(), anyString(), anyString(), anyString(), anyLong());
    }

    @Test
    void manualTakeoverAndExplicitBlockerPreventAutomaticContinuation() {
        service.start("session-1", request("修复菜单", 60));
        service.onManualInput(new SessionManualInputEvent("session-1", "send"));
        assertThat(state.get().state()).isEqualTo(AutopilotState.PAUSED);
        var paused = state.get();
        service.action("session-1", "resume", paused.context().version());
        service.reportProgress("session-1", new SessionAutopilotService.ProgressReport(
                "WAITING_USER", "代码已修改", null, List.of("等待重启验收"), List.of("定向测试通过"), "需要本次重启授权"));
        clearInvocations(queue);
        settle("waiting-turn");
        assertThat(state.get().state()).isEqualTo(AutopilotState.WAITING_USER);
        assertThat(state.get().reason()).contains("重启授权");
        assertThat(state.get().latestSummary()).isEqualTo("代码已修改");
        verify(queue, never()).saveInternal(anyString(), anyString(), anyString(), anyString(), anyString(), anyLong());
        verifyNoInteractions(specs, skills);
    }

    @Test
    void restartRecoveryAndLegacyQueueDoNotReadAnInventedSpec() {
        service.start("session-1", request("优化菜单", 60));
        when(repository.findRecent("", null, null, 200)).thenReturn(List.of(state.get()));
        when(runtime.canStartTurn("session-1")).thenReturn(new SessionRuntimeStateService.SendDecision(true, "READY", "空闲"));
        clearInvocations(queue);
        service.reconcileActiveRuns();
        verify(queue).saveInternal(eq("session-1"), anyString(), anyString(), anyString(), anyString(), anyLong());
        var handoff = RequirementAutopilot.handoff(state.get(), state.get());
        var queued = new AutopilotQueuedContextService(repository, specs);
        assertThat(queued.resolve(new QueuedChatMessage(handoff.id(), "session-1", "继续", null,
                "伪造控制上下文", List.of(), 1L, null))).contains("优化菜单").doesNotContain("伪造控制上下文");
        service.action("session-1", "pause", state.get().context().version());
        assertThatThrownBy(() -> queued.resolve(new QueuedChatMessage(handoff.id(), "session-1", "继续", null,
                null, List.of(), 1L, null))).isInstanceOf(AutopilotQueuedContextService.StaleContinuationException.class);
        verifyNoInteractions(specs, skills);
    }

    private SessionAutopilotService.ProgressReport report(String disposition, List<String> remaining, List<String> evidence) {
        return new SessionAutopilotService.ProgressReport(disposition, "本轮实际工作", "完成必要验收", remaining, evidence, null);
    }

    @Test
    void threePersistedFollowupsSuspendAndResumeCreatesANewRecoveryGeneration() {
        var defaultRequest = new SessionAutopilotService.StartRequest("D:/repo", null, "修复菜单", false,
                60, 3, 60, null, null, null, null);
        assertThat(service.start("session-1", defaultRequest).completionPolicy()).isEqualTo("REQUIREMENT_BEST_EFFORT");
        when(repository.findRecent("", null, null, 200)).thenAnswer(call -> List.of(state.get()));
        when(runtime.canStartTurn("session-1")).thenReturn(new SessionRuntimeStateService.SendDecision(true, "READY", "空闲"));
        for (int attempt = 1; attempt <= 3; attempt++) {
            var before = state.get();
            var event = new SessionTurnSettledEvent("session-1", "failed-" + attempt, "error", false, 1L);
            service.evaluateSettled(before, event);
            service.evaluateSettled(before, event);
            assertThat(state.get().state()).isEqualTo(AutopilotState.ACTIVE);
            assertThat(state.get().noProgressCount()).isEqualTo(attempt);
            assertThat(state.get().turnCount()).isEqualTo(attempt);
            // 新建编排实例仍读取同一持久步骤；摘要变化不会清零核对次数。
            service = new SessionAutopilotService(repository, mock(ClaudeChatSessionRepository.class),
                    mock(ClaudeChatSessionAccessPolicy.class), queue, runtime, resolver, specs,
                    mock(OpenSpecContinuousRunner.class), skills, new ObjectMapper(), mock(ApplicationEventPublisher.class));
            clearInvocations(queue);
            service.reconcileActiveRuns();
            verify(queue).saveInternal(anyString(), anyString(), anyString(), contains("完成核对 " + attempt + "/3"),
                    contains("不是重放原任务"), anyLong());
        }
        service.evaluateSettled(state.get(), new SessionTurnSettledEvent("session-1", "third-answer-unclear", "completed", true, 2L));
        assertThat(state.get().state()).isEqualTo(AutopilotState.PAUSED);
        assertThat(state.get().reason()).contains("OUTCOME_CHECK_EXHAUSTED");
        var resumed = service.action("session-1", "resume", state.get().context().version());
        assertThat(resumed.state()).isEqualTo("ACTIVE");
        assertThat(resumed.noProgressCount()).isZero();
        verifyNoInteractions(specs, skills);
    }

    @Test
    void confirmedProgressResetsChecksAndCompletionStillNeedsASuccessfulTerminal() {
        service.start("session-1", request("修复菜单", 60));
        service.evaluateSettled(state.get(), new SessionTurnSettledEvent("session-1", "failed", "error", false, 1L));
        service.reportProgress("session-1", report("CONTINUE", List.of("验证菜单"), List.of("菜单实现已修改")));
        settle("progress");
        assertThat(state.get().state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(state.get().noProgressCount()).isZero();
        service.reportProgress("session-1", new SessionAutopilotService.ProgressReport("FAILED", "验证失败", null,
                List.of("修复并复测"), List.of("菜单测试失败"), "断言失败"));
        settle("reported-failure");
        assertThat(state.get().reason()).contains("完成核对 1/3");
        service.reportProgress("session-1", report("COMPLETE", List.of(), List.of("菜单定向回归通过")));
        settle("verified");
        assertThat(state.get().state()).isEqualTo(AutopilotState.COMPLETED);
        verifyNoInteractions(specs, skills);
    }

    private void settle(String id) {
        int count = state.get().turnCount();
        service.evaluateSettled(state.get(), new SessionTurnSettledEvent("session-1", id, "completed", true, Instant.now().toEpochMilli()));
        assertThat(state.get().turnCount()).isEqualTo(count + 1);
    }
}
