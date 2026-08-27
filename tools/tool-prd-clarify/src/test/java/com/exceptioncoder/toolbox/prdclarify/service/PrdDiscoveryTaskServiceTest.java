package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdDiscoveryRun;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdDiscoveryRunRepository;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.AsyncTaskExecutor;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PrdDiscoveryTaskServiceTest {

    @Test
    void shouldUpgradeLegacyClarifyingSessionToBackgroundDiscovery() {
        PrdDiscoveryRunRepository runs = mock(PrdDiscoveryRunRepository.class);
        PrdSessionRepository sessions = mock(PrdSessionRepository.class);
        PrdDiscoveryService discovery = mock(PrdDiscoveryService.class);
        AsyncTaskExecutor executor = mock(AsyncTaskExecutor.class);
        PrdSession session = PrdSession.builder()
                .id("legacy-session")
                .title("历史澄清会话")
                .rawInput("保留原始需求并重新探索")
                .status("CLARIFYING")
                .engine("codex")
                .build();

        when(sessions.findById("legacy-session")).thenReturn(Optional.of(session));
        when(runs.findRunningBySessionId("legacy-session")).thenReturn(Optional.empty());
        when(runs.insert(any(PrdDiscoveryRun.class))).thenReturn(true);

        new PrdDiscoveryTaskService(
                runs, sessions, discovery, new PrdInitialSpecValidator(), executor, new ObjectMapper())
                .schedule("legacy-session");

        verify(sessions).updateStatus("legacy-session", "DISCOVERING");
        verify(executor).execute(any(Runnable.class));
    }

    @Test
    void shouldStopAfterThreeIncompleteVibeCodingAttempts() {
        PrdDiscoveryRunRepository runs = mock(PrdDiscoveryRunRepository.class);
        PrdSessionRepository sessions = mock(PrdSessionRepository.class);
        PrdDiscoveryService discovery = mock(PrdDiscoveryService.class);
        PrdInitialSpecValidator validator = mock(PrdInitialSpecValidator.class);
        AsyncTaskExecutor executor = mock(AsyncTaskExecutor.class);
        AtomicReference<PrdDiscoveryRun> inserted = new AtomicReference<>();
        PrdSession session = PrdSession.builder()
                .id("session-1")
                .title("订单取消")
                .rawInput("支持审核前取消")
                .status("DISCOVERING")
                .engine("codex")
                .build();
        PrdDiscoveryService.DiscoveryContext context =
                new PrdDiscoveryService.DiscoveryContext(session, "prompt", null, List.of(),
                        "{\"version\":\"planning-evidence-trace-v2\"}");

        when(sessions.findById("session-1")).thenReturn(Optional.of(session));
        when(runs.findRunningBySessionId("session-1")).thenReturn(Optional.empty());
        when(runs.insert(any(PrdDiscoveryRun.class))).thenAnswer(invocation -> {
            inserted.set(invocation.getArgument(0));
            return true;
        });
        when(runs.findById(anyString())).thenAnswer(invocation -> Optional.ofNullable(inserted.get()));
        when(discovery.prepare("session-1")).thenReturn(context);
        when(discovery.generate(any(), anyInt(), anyString(), any()))
                .thenReturn(new PrdDiscoveryService.DiscoveryAttempt(
                        "不完整规格", "vibe-execution-1", "trace-1"));
        when(validator.validate(anyString())).thenReturn(
                new PrdInitialSpecValidator.ValidationResult(false, List.of("缺少验收场景")));
        when(runs.fail(anyString(), anyString(), anyString(), anyLong())).thenReturn(true);
        doAnswer(invocation -> {
            invocation.<Runnable>getArgument(0).run();
            return null;
        }).when(executor).execute(any(Runnable.class));

        new PrdDiscoveryTaskService(runs, sessions, discovery, validator, executor, new ObjectMapper())
                .schedule("session-1");

        verify(discovery, times(3)).generate(any(), anyInt(), anyString(), any());
        verify(discovery, never()).publish(anyString(), anyString());
        verify(runs).fail(anyString(), anyString(), anyString(), anyLong());
        verify(sessions).updateError("session-1", "探索已完成 3 次循环，仍未通过初始化规格检查");
    }

    @Test
    void shouldNotRunAFourthAttemptWhenResumingAtLimit() {
        PrdDiscoveryRunRepository runs = mock(PrdDiscoveryRunRepository.class);
        PrdSessionRepository sessions = mock(PrdSessionRepository.class);
        PrdDiscoveryService discovery = mock(PrdDiscoveryService.class);
        AsyncTaskExecutor executor = mock(AsyncTaskExecutor.class);
        long now = System.currentTimeMillis();
        PrdDiscoveryRun run = new PrdDiscoveryRun(
                "run-1", "session-1", "RUNNING", "VALIDATING", 81, 3, 3,
                PrdInitialSpecValidator.CRITERIA_VERSION, PrdDiscoveryService.PROMPT_VERSION,
                "hash", "codex", null, "vibe-3", "trace-3",
                "{\"version\":\"planning-evidence-trace-v2\"}", "不完整规格",
                "{\"gaps\":[\"缺少验收场景\"]}", null, now, null, now, now);

        when(runs.findRunning()).thenReturn(List.of(run));
        when(runs.findById("run-1")).thenReturn(Optional.of(run));
        when(runs.fail(anyString(), anyString(), anyString(), anyLong())).thenReturn(true);
        doAnswer(invocation -> {
            invocation.<Runnable>getArgument(0).run();
            return null;
        }).when(executor).execute(any(Runnable.class));

        new PrdDiscoveryTaskService(
                runs, sessions, discovery, new PrdInitialSpecValidator(), executor, new ObjectMapper())
                .resumeRunningTasks();

        verify(discovery, never()).prepare(anyString());
        verify(discovery, never()).generate(any(), anyInt(), anyString(), any());
        verify(sessions).updateError("session-1", "探索已达到 3 次执行上限，请重新探索");
    }
}
