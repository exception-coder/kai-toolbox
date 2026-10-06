package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AutopilotTurnHandoffTest {
    @Test
    void acknowledgedSkillUsesCompactHandoffWithoutLosingIdentityOrSafety() {
        var run = run();
        var fallback = AutopilotTurnHandoff.forRun(run, 2, 8, "继续 task");
        when(run.skillActivated()).thenReturn(true);
        var compact = AutopilotTurnHandoff.forRun(run, 2, 8, "继续 task");
        assertThat(compact.id()).isEqualTo(fallback.id());
        for (String instructions : new String[] {compact.instructions(), fallback.instructions()}) {
            assertThat(instructions).contains("IMPLEMENTATION_SCOPE_DRIFT", "scopeFingerprint",
                    "abort_execution", "原完整范围加本任务新增文件", "HTTP 409", "版本化恢复入口", "不中止他人执行");
        }
        assertThat(compact.instructions().length()).isLessThan(fallback.instructions().length() / 2);
        assertThat(compact.instructions()).contains("run-1", "change-a", "1.2", "revision-a",
                "[MANUAL_CONFIRMATION]", "[MANUAL_PRODUCTION]", "FORGE_SUPERVISED_NO_DOCKER=1",
                "推荐默认方案", "forge.report_session_progress", "权限和预算边界仍有效");
        // Resume/engine reload clears acknowledgement: full recovery instructions must return.
        when(run.skillActivated()).thenReturn(false);
        assertThat(AutopilotTurnHandoff.forRun(run, 2, 8, "继续 task").instructions())
                .isEqualTo(fallback.instructions()).contains("discover_execution", "assess_execution");
    }

    private SessionAutopilotRun run() {
        var run = mock(SessionAutopilotRun.class);
        when(run.id()).thenReturn("run-1");
        when(run.context()).thenReturn(new OpenSpecExecutionContext("D:/repo", "repo", "main", "fp",
                "change-a", "revision-a", "1.2", 2, OpenSpecExecutionPhase.APPLY, "thread-1", 1, 0));
        when(run.maxTurns()).thenReturn(180);
        return run;
    }
}
