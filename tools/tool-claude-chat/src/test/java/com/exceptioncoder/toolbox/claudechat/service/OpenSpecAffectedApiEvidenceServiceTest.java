package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.OpenSpecBoardView.AffectedApiEvidence;
import com.exceptioncoder.toolbox.claudechat.domain.SessionAffectedApi;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotCompletionPolicy;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotState;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAffectedApiRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAutopilotRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OpenSpecAffectedApiEvidenceServiceTest {

    @TempDir
    Path projectDirectory;

    @Test
    void scopesByProjectAndRunStartAndKeepsLatestEndpointEvidence() {
        SessionAutopilotRepository autopilotRepository = mock(SessionAutopilotRepository.class);
        SessionAffectedApiRepository affectedApiRepository = mock(SessionAffectedApiRepository.class);
        OpenSpecAffectedApiEvidenceService service =
                new OpenSpecAffectedApiEvidenceService(autopilotRepository, affectedApiRepository);
        SessionAutopilotRun first = run("run-1", "session-1", projectDirectory, 100, 200);
        SessionAutopilotRun second = run("run-2", "session-2", projectDirectory, 100, 300);
        SessionAutopilotRun otherProject = run("run-3", "session-3",
                projectDirectory.resolveSibling("other"), 100, 400);
        when(autopilotRepository.findByChangeId("board"))
                .thenReturn(List.of(first, second, otherProject));
        when(affectedApiRepository.findBySessionId("session-1")).thenReturn(List.of(
                api("old", "session-1", "/api/old", "UNVERIFIED", 99),
                api("first", "session-1", "/api/orders", "UNVERIFIED", 200)));
        when(affectedApiRepository.findBySessionId("session-2")).thenReturn(List.of(
                api("second", "session-2", "/api/orders", "PASSED", 300)));

        List<AffectedApiEvidence> evidence = service.evidence(projectDirectory, "board");

        assertThat(evidence).singleElement().satisfies(api -> {
            assertThat(api.sessionId()).isEqualTo("session-2");
            assertThat(api.apiPath()).isEqualTo("/api/orders");
            assertThat(api.verificationStatus()).isEqualTo("PASSED");
            assertThat(api.updatedAt()).isEqualTo(Instant.ofEpochMilli(300));
        });
    }

    private SessionAutopilotRun run(String id, String sessionId, Path projectRoot,
                                    long startedAt, long updatedAt) {
        OpenSpecExecutionContext context = new OpenSpecExecutionContext(
                projectRoot.toString(), projectRoot.toString(), "main", "workspace", "board", "revision",
                "1.1", 1, OpenSpecExecutionPhase.APPLY, "agent", 1, 0);
        return new SessionAutopilotRun(id, sessionId, "完成 board change",
                AutopilotCompletionPolicy.OPEN_SPEC_STRICT, AutopilotState.ACTIVE, null, context,
                1, 60, 0, 3, true, true, "skill", "1", "hash", true,
                0, 1, null, null, null, null, null, null,
                Instant.ofEpochMilli(startedAt), Instant.ofEpochMilli(startedAt + 10_000),
                Instant.ofEpochMilli(updatedAt));
    }

    private SessionAffectedApi api(String id, String sessionId, String path, String status, long updatedAt) {
        return new SessionAffectedApi(id, sessionId, "GET", path, "MODIFIED",
                "src/OrderController.java", "OrderController#list", "订单接口", status,
                "PASSED".equals(status) ? "AUTOMATED_TEST" : null, null,
                "PASSED".equals(status) ? "passed" : null, updatedAt, updatedAt,
                "PASSED".equals(status) ? updatedAt : null);
    }
}
