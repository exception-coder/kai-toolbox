package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.*;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAutopilotRepository;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.TaskSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionTurnSettledEvent;
import com.exceptioncoder.toolbox.claudechat.service.governance.ProjectExecutionControlStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.nio.file.Path;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AutopilotContinuationIntegrationTest {
    @TempDir Path root;

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void settledContinuationCarriesReportButCannotReuseItsDisposition(boolean gatesEnabled) {
        var f = fixture(gatesEnabled);
        f.service.reportProgress("session", new SessionAutopilotService.ProgressReport("CONTINUE",
                "账号查询已实现", "补齐账号停用", List.of("账号停用版本冲突"), List.of("account-query-tests: PASS"), null));

        f.service.onSettled(settled("turn-1"));

        var instructions = ArgumentCaptor.forClass(String.class);
        var text = ArgumentCaptor.forClass(String.class);
        verify(f.queue, timeout(4000)).saveInternal(eq("session"), anyString(), text.capture(), anyString(),
                instructions.capture(), anyLong());
        assertThat(text.getValue()).contains("account-management", "2.1", "账号管理");
        assertThat(instructions.getValue()).contains("账号查询已实现", "补齐账号停用", "账号停用版本冲突", "account-query-tests: PASS");
        assertThat(f.state.get().latestDisposition()).isNull();
        assertThat(f.state.get().latestSummary()).isNull();
        assertThat(f.state.get().context().currentTaskId()).isEqualTo("2.1");
        assertThat(f.state.get().completedTasks()).isZero();
        verifyNoInteractions(f.quality);
    }

    @Test
    void taskSwitchDoesNotCarryPreviousAcceptanceOrMarkNewTaskComplete() {
        var f = fixture(false);
        f.service.reportProgress("session", new SessionAutopilotService.ProgressReport("COMPLETE",
                "旧任务已完成", "旧任务后续动作", List.of("旧任务专属缺项：角色停用 API"), List.of("old-tests: PASS"), null));
        var next = new TaskSnapshot("2.2", 2, "实现账号管理页面", false);
        f.snapshot.set(new ChangeSnapshot("account-management", "revision-b", 1, 2,
                List.of(new TaskSnapshot("2.1", 1, "账号管理公开契约", true), next), Map.of(), next));

        f.service.onSettled(settled("turn-2"));

        var instructions = ArgumentCaptor.forClass(String.class);
        var text = ArgumentCaptor.forClass(String.class);
        verify(f.queue, timeout(4000)).saveInternal(eq("session"), anyString(), text.capture(), anyString(),
                instructions.capture(), anyLong());
        assertThat(text.getValue()).contains("2.2", "账号管理页面");
        assertThat(instructions.getValue()).doesNotContain("旧任务已完成", "旧任务后续动作", "旧任务专属缺项：角色停用 API", "old-tests: PASS");
        assertThat(f.state.get().context().currentTaskId()).isEqualTo("2.2");
        assertThat(f.state.get().latestDisposition()).isNull();
        assertThat(f.state.get().completedTasks()).isEqualTo(1);
    }

    @Test
    void missingReportStillDispatchesSpecificTaskWithoutInventingEvidence() {
        var f = fixture(false);
        f.service.onSettled(settled("turn-3"));
        var instructions = ArgumentCaptor.forClass(String.class);
        var text = ArgumentCaptor.forClass(String.class);
        verify(f.queue, timeout(4000)).saveInternal(eq("session"), anyString(), text.capture(), anyString(),
                instructions.capture(), anyLong());
        assertThat(text.getValue()).contains("2.1", "账号管理公开契约");
        assertThat(instructions.getValue()).contains("账号管理公开契约").doesNotContain("account-query-tests: PASS");
        assertThat(f.state.get().state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(f.state.get().completedTasks()).isZero();
    }

    private SessionTurnSettledEvent settled(String turn) {
        return new SessionTurnSettledEvent("session", turn, "end_turn", true, System.currentTimeMillis());
    }

    private Fixture fixture(boolean gatesEnabled) {
        if (!gatesEnabled) ProjectExecutionControlStore.update(root, 0, false, "developer", "controlled development");
        var repository = mock(SessionAutopilotRepository.class);
        var queue = mock(QueuedChatMessageService.class);
        var specs = mock(OpenSpecAutopilotAdapter.class);
        var quality = mock(ForgeQualityGateAdapter.class);
        var now = Instant.now();
        var context = new OpenSpecExecutionContext(root.toString(), "repo", "main", "workspace", "account-management",
                "revision-a", "2.1", 1, OpenSpecExecutionPhase.APPLY, "thread", 1, 0);
        var state = new AtomicReference<>(new SessionAutopilotRun("run", "session", "完成账号管理",
                AutopilotCompletionPolicy.OPEN_SPEC_STRICT, AutopilotState.ACTIVE, null, context,
                0, 60, 0, 3, false, true, ".agents/skills", "1", "hash", true,
                0, 1, null, null, null, null, null, null, now, now.plusSeconds(3600), now));
        var task = new TaskSnapshot("2.1", 1, "账号管理公开契约，验证账号停用及版本冲突", false);
        var snapshot = new AtomicReference<>(new ChangeSnapshot("account-management", "revision-a", 0, 1,
                List.of(task), Map.of(), task));
        when(repository.findBySessionId("session")).thenAnswer(call -> Optional.of(state.get()));
        when(repository.update(any(), anyLong())).thenAnswer(call -> {
            if (state.get().context().version() != call.<Long>getArgument(1)) return false;
            state.set(call.getArgument(0));
            return true;
        });
        var seen = new HashSet<String>();
        when(repository.appendStep(any())).thenAnswer(call -> seen.add(call.<AutopilotStep>getArgument(0).predecessorTurnId()));
        when(specs.inspect(eq(root), eq("account-management"))).thenAnswer(call -> snapshot.get());
        var service = new SessionAutopilotService(repository, mock(ClaudeChatSessionRepository.class),
                mock(ClaudeChatSessionAccessPolicy.class), queue, mock(SessionRuntimeStateService.class),
                mock(AutopilotProjectContextResolver.class), specs, new OpenSpecContinuousRunner(specs, quality),
                mock(ContinuousExecutionSkillProvisioner.class), new ObjectMapper(), mock(ApplicationEventPublisher.class));
        return new Fixture(service, queue, quality, state, snapshot);
    }

    private record Fixture(SessionAutopilotService service, QueuedChatMessageService queue,
                           ForgeQualityGateAdapter quality, AtomicReference<SessionAutopilotRun> state,
                           AtomicReference<ChangeSnapshot> snapshot) { }
}
