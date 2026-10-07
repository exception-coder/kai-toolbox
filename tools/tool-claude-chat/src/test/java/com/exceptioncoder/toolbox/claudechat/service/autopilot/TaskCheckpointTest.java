package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.*;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.TaskSnapshot;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.time.Instant;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class TaskCheckpointTest {
    @Test void carriesRemainingWorkAndEvidenceWithoutPromotingTheReportToAcceptance() {
        var previous = run("");
        when(previous.latestReportAt()).thenReturn(Instant.parse("2026-10-07T00:00:00Z"));
        when(previous.latestRemainingWorkJson()).thenReturn("[\"权限拒绝分支尚未实现\"]");
        when(previous.latestEvidenceJson()).thenReturn("[\"账户编辑测试已通过，需要核对输入是否变化\"]");
        when(previous.latestNextAction()).thenReturn("实现权限拒绝分支");
        when(previous.latestDisposition()).thenReturn(AutopilotDisposition.COMPLETE);
        var next = run("");
        var nextContext = previous.context().withTask("2.1", 1, "revision");
        when(next.context()).thenReturn(nextContext);
        when(next.turnCount()).thenReturn(2);
        String result = TaskCheckpoint.describe(next, tasks(), previous);
        assertThat(result).contains("权限拒绝分支尚未实现", "账户编辑测试已通过", "实现权限拒绝分支",
                "不代表验收通过", "authorizedTaskIds",
                "\"reportState\":\"AVAILABLE\"", "COMPLETE 或其他完成表述不能代替当前验收判定")
                .doesNotContain("\"disposition\"", "\"latestDisposition\"", "commit_execution",
                        "discover_execution", "recovery.category");
        assertThat(next.latestReportAt()).isNull();
    }

    @Test void malformedAndOversizedReportsStayExplicitAndCannotBreakContinuation() {
        var run = run("");
        when(run.latestReportAt()).thenReturn(Instant.parse("2026-10-07T00:00:00Z"));
        when(run.latestRemainingWorkJson()).thenReturn("{invalid");
        when(run.latestEvidenceJson()).thenReturn("x".repeat(25000));
        assertThat(TaskCheckpoint.describe(run, List.of())).contains("报告格式无效", "报告过长");
    }

    @ParameterizedTest
    @ValueSource(strings = {"run", "session", "project", "repository", "branch", "workspace", "change",
            "revision", "generation", "phase", "task", "ordinal"})
    void changedIdentityCannotTransferOldTaskRequirements(String changed) {
        var previous = run("");
        when(previous.latestReportAt()).thenReturn(Instant.parse("2026-10-07T00:00:00Z"));
        when(previous.latestSummary()).thenReturn("旧任务专属报告");
        when(previous.latestRemainingWorkJson()).thenReturn("[\"旧任务权限拒绝分支\"]");
        when(previous.latestEvidenceJson()).thenReturn("[\"旧任务测试记录\"]");
        when(previous.latestNextAction()).thenReturn("旧任务下一步");
        assertThat(TaskCheckpoint.describe(run(changed), tasks(), previous))
                .contains("\"reportState\":\"CONTEXT_CHANGED\"", "不把旧任务缺项当作当前要求")
                .doesNotContain("旧任务专属报告", "旧任务权限拒绝分支", "旧任务测试记录", "旧任务下一步");
    }

    @Test void missingReportDoesNotRecoverDataFromTheClearedDispatchState() {
        var next = run("");
        when(next.latestSummary()).thenReturn("不应从 next 偷读的报告");
        assertThat(TaskCheckpoint.describe(next, tasks(), null))
                .contains("\"reportState\":\"NO_REPORT\"").doesNotContain("不应从 next 偷读的报告");
        assertThat(TaskCheckpoint.describe(next, tasks(), run("")))
                .contains("\"reportState\":\"NO_REPORT\"").doesNotContain("不应从 next 偷读的报告");
    }

    private List<TaskSnapshot> tasks() {
        return List.of(new TaskSnapshot("2.1", 1, "账户管理", false));
    }

    private SessionAutopilotRun run(String changed) {
        var run = mock(SessionAutopilotRun.class);
        when(run.id()).thenReturn("run".equals(changed) ? "other-run" : "run");
        when(run.sessionId()).thenReturn("session".equals(changed) ? "other-session" : "session");
        when(run.context()).thenReturn(new OpenSpecExecutionContext(
                "project".equals(changed) ? "D:/other" : "D:/repo",
                "repository".equals(changed) ? "other-repo" : "repo",
                "branch".equals(changed) ? "other-branch" : "main",
                "workspace".equals(changed) ? "other-fingerprint" : "fp",
                "change".equals(changed) ? "other-change" : "account",
                "revision".equals(changed) ? "other-revision" : "revision",
                "task".equals(changed) ? "2.2" : "2.1", "ordinal".equals(changed) ? 2 : 1,
                "phase".equals(changed) ? OpenSpecExecutionPhase.VERIFY : OpenSpecExecutionPhase.APPLY,
                "thread", "generation".equals(changed) ? 2 : 1, 0));
        return run;
    }
}
