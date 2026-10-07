package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.*;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.TaskSnapshot;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class TaskCheckpointTest {
    @Test void carriesRemainingWorkAndEvidenceWithoutPromotingTheReportToAcceptance() {
        var run = mock(SessionAutopilotRun.class);
        when(run.context()).thenReturn(new OpenSpecExecutionContext("D:/repo", "repo", "main", "fp", "account", "revision",
                "2.1", 1, OpenSpecExecutionPhase.APPLY, "thread", 1, 0));
        when(run.latestRemainingWorkJson()).thenReturn("[\"权限拒绝分支尚未实现\"]");
        when(run.latestEvidenceJson()).thenReturn("[\"账户编辑测试已通过，需要核对输入是否变化\"]");
        when(run.latestNextAction()).thenReturn("实现权限拒绝分支");
        String result = TaskCheckpoint.describe(run, List.of(new TaskSnapshot("2.1", 1, "账户管理", false)));
        assertThat(result).contains("权限拒绝分支尚未实现", "账户编辑测试已通过", "实现权限拒绝分支",
                "不代表验收通过", "authorizedTaskIds", "commit_execution", "状态或输入未改变时不重复");
    }

    @Test void malformedAndOversizedReportsStayExplicitAndCannotBreakContinuation() {
        var run = mock(SessionAutopilotRun.class);
        when(run.context()).thenReturn(new OpenSpecExecutionContext("D:/repo", "repo", "main", "fp", "account", "revision",
                "2.1", 1, OpenSpecExecutionPhase.APPLY, "thread", 1, 0));
        when(run.latestRemainingWorkJson()).thenReturn("{invalid");
        when(run.latestEvidenceJson()).thenReturn("x".repeat(25000));
        assertThat(TaskCheckpoint.describe(run, List.of())).contains("报告格式无效", "报告过长");
    }
}
