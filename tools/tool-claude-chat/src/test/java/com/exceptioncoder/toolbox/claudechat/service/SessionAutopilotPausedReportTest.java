package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotCompletionPolicy;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotState;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAutopilotRepository;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.autopilot.SessionQueueReleaseRequestedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SessionAutopilotPausedReportTest {
    private final SessionAutopilotRepository repository = mock(SessionAutopilotRepository.class);
    private final OpenSpecAutopilotAdapter specs = mock(OpenSpecAutopilotAdapter.class);
    private final QueuedChatMessageService queue = mock(QueuedChatMessageService.class);
    private final OpenSpecContinuousRunner runner = mock(OpenSpecContinuousRunner.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final SessionAutopilotService service = new SessionAutopilotService(repository,
            mock(ClaudeChatSessionRepository.class), mock(ClaudeChatSessionAccessPolicy.class), queue,
            mock(SessionRuntimeStateService.class), mock(AutopilotProjectContextResolver.class), specs,
            runner, mock(ContinuousExecutionSkillProvisioner.class), new ObjectMapper(), events);

    @ParameterizedTest
    @ValueSource(strings = {"CONTINUE", "COMPLETE"})
    void pausedReportRefreshesCountsWithoutResumingOrChangingExecutionBinding(String disposition) {
        var original = run(AutopilotState.PAUSED);
        when(repository.findBySessionId("session")).thenReturn(Optional.of(original));
        when(repository.update(any(), eq(80L))).thenReturn(true);
        when(specs.inspect(any(), eq("change"))).thenReturn(new ChangeSnapshot(
                "change", "new-revision", 4, 24, List.of(), Map.of(), null));

        var request = report();
        var view = service.reportProgress("session", new SessionAutopilotService.ProgressReport(disposition,
                request.summary(), request.nextAction(), request.remainingWork(), request.evidence(), request.reason()));

        var stored = ArgumentCaptor.forClass(SessionAutopilotRun.class);
        verify(repository).update(stored.capture(), eq(80L));
        var saved = stored.getValue();
        assertThat(view.state()).isEqualTo("PAUSED");
        assertThat(saved.reason()).isEqualTo(original.reason());
        assertThat(saved.completedTasks()).isEqualTo(4);
        assertThat(saved.totalTasks()).isEqualTo(24);
        assertThat(saved.context().currentTaskId()).isEqualTo("2.1");
        assertThat(saved.context().changeRevision()).isEqualTo("revision");
        assertThat(saved.context().generation()).isEqualTo(5);
        assertThat(saved.context().version()).isEqualTo(81);
        assertThat(saved.turnCount()).isEqualTo(original.turnCount());
        assertThat(saved.noProgressCount()).isEqualTo(original.noProgressCount());
        assertThat(saved.latestEvidenceJson()).contains("commit cf45a06f");
        assertThat(saved.latestRemainingWorkJson()).contains("真实通道未验收");
        verify(specs, times(1)).inspect(any(), eq("change"));
        verify(specs, never()).strictValidate(any(), any());
        verifyNoInteractions(queue, runner);
        verify(events, never()).publishEvent(any(SessionQueueReleaseRequestedEvent.class));
    }

    @Test
    void unreadableSpecsStillRecordEvidenceAndExplicitlyRetainOldCounts() {
        when(repository.findBySessionId("session")).thenReturn(Optional.of(run(AutopilotState.PAUSED)));
        when(repository.update(any(), anyLong())).thenReturn(true);
        when(specs.inspect(any(), any())).thenThrow(new IllegalStateException("secret diagnostic"));
        var view = service.reportProgress("session", report());
        assertThat(view.progress().completedTasks()).isEqualTo(3);
        assertThat(view.latestReport().summary()).contains("规格进度读取失败").doesNotContain("secret diagnostic");
        assertThat(view.state()).isEqualTo("PAUSED");
        verifyNoInteractions(queue, runner);
    }

    @Test
    void concurrentStopIsReReadAndNeverOverwrittenByLateReport() {
        when(repository.findBySessionId("session")).thenReturn(
                Optional.of(run(AutopilotState.PAUSED)), Optional.of(run(AutopilotState.STOPPED)));
        when(repository.update(any(), anyLong())).thenReturn(false);
        assertThatThrownBy(() -> service.reportProgress("session", report()))
                .isInstanceOf(AutopilotProgressConflictException.class);
        verify(repository, times(1)).update(any(), anyLong());
        verifyNoInteractions(queue, runner);
    }

    private SessionAutopilotService.ProgressReport report() {
        return new SessionAutopilotService.ProgressReport("CONTINUE", "task 2.1 本地完成", "继续 2.2",
                List.of("真实通道未验收"), List.of("commit cf45a06f"), null);
    }

    private SessionAutopilotRun run(AutopilotState state) {
        Instant now = Instant.now();
        var context = new OpenSpecExecutionContext("D:/repo", "D:/repo", "main", "workspace",
                "change", "revision", "2.1", 4, OpenSpecExecutionPhase.APPLY, "native-session", 5, 80);
        return new SessionAutopilotRun("run", "session", "goal", AutopilotCompletionPolicy.OPEN_SPEC_STRICT,
                state, "用户接管会话", context, 20, 180, 3, 3, true, true, ".agents/skills", "1", "hash",
                true, 3, 24, null, null, null, null, null, null, now, now.plusSeconds(3600), now);
    }
}
