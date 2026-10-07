package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.TaskSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.governance.ProjectExecutionControlStore;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AutopilotTurnHandoffTest {
    @Test
    void fullCompactAndDeveloperHandoffsCarryPriorCheckpointAndExactTask(@TempDir Path root) {
        var previous = run();
        var next = run();
        var context = new OpenSpecExecutionContext(root.toString(), "repo", "main", "fp",
                "change-a", "revision-a", "1.2", 2, OpenSpecExecutionPhase.APPLY, "thread-1", 1, 0);
        when(previous.context()).thenReturn(context);
        when(next.context()).thenReturn(context.withTask("1.2", 2, "revision-a"));
        when(previous.latestReportAt()).thenReturn(Instant.parse("2026-10-07T00:00:00Z"));
        when(previous.latestRemainingWorkJson()).thenReturn("[\"补齐账户权限拒绝分支\"]");
        when(previous.latestEvidenceJson()).thenReturn("[\"账户查询测试通过\"]");
        var task = new TaskSnapshot("1.2", 2, "完成账户管理的新增、编辑和权限拒绝流程", false);
        var snapshot = new ChangeSnapshot("change-a", "revision-a", 1, 3, List.of(task), Map.of(), task);
        for (int mode = 0; mode < 3; mode++) {
            when(next.skillActivated()).thenReturn(mode == 1);
            if (mode == 2) ProjectExecutionControlStore.update(root, 0, false, "developer", "继续开发");
            var message = AutopilotTurnHandoff.forRun(next, snapshot, "continue", previous);
            assertThat(message.text()).contains("change-a", "task 1.2", task.description())
                    .doesNotContain("继续开发者控制下的当前任务", "自动监督下一步");
            assertThat(message.instructions()).contains("补齐账户权限拒绝分支", "账户查询测试通过",
                    "先保存成果并回到当前验收", "不得无证据勾选任务或删改他人成果", "不代表验收通过",
                    "前端先完成当前可交付功能的页面与接口接线", "也不拖到整个规格批次结束",
                    "用户明确要求、缺陷复现或高风险问题", "启动/重启仍须遵循项目授权",
                    "未运行的验收不能记为通过");
        }
        assertThat(next.latestReportAt()).isNull();
    }

    @Test
    void changedTaskKeepsNewAcceptanceAndDoesNotLeakOldReport() {
        var previous = run();
        when(previous.latestReportAt()).thenReturn(Instant.parse("2026-10-07T00:00:00Z"));
        when(previous.latestRemainingWorkJson()).thenReturn("[\"旧任务专属缺项：账号删除\"]");
        var next = run();
        var nextContext = previous.context().withTask("1.3", 3, "revision-b");
        when(next.context()).thenReturn(nextContext);
        var task = new TaskSnapshot("1.3", 3, "完成账户禁用审计", false);
        var snapshot = new ChangeSnapshot("change-a", "revision-b", 2, 3, List.of(task), Map.of(), task);
        var message = AutopilotTurnHandoff.forRun(next, snapshot, "next task", previous);
        assertThat(message.text()).contains("task 1.3", "完成账户禁用审计").doesNotContain("task 1.2");
        assertThat(message.instructions()).contains("CONTEXT_CHANGED").doesNotContain("旧任务专属缺项：账号删除");
    }

    @Test
    void acknowledgedSkillUsesCompactHandoffWithoutLosingIdentityOrSafety() {
        var run = run();
        var fallback = AutopilotTurnHandoff.forRun(run, 2, 8, "继续 task");
        when(run.skillActivated()).thenReturn(true);
        var compact = AutopilotTurnHandoff.forRun(run, 2, 8, "继续 task");
        assertThat(compact.id()).isEqualTo(fallback.id());
        assertThat(fallback.instructions()).contains("IMPLEMENTATION_SCOPE_DRIFT", "scopeFingerprint",
                "abort_execution", "原完整范围加本任务新增文件", "HTTP 409", "版本化恢复入口", "不中止他人执行");
        assertThat(compact.instructions().length()).isLessThan(fallback.instructions().length() / 2);
        assertThat(compact.instructions()).contains("run-1", "change-a", "1.2", "revision-a",
                "FORGE_SUPERVISED_NO_DOCKER=1", "forge.report_session_progress", "权限和预算边界仍有效",
                "手动暂停、服务重启、资源访问及生产操作遵循原授权", "最终交付门禁和人工生产授权保留")
                .doesNotContain("abort_execution", "原完整范围加本任务新增文件", "HTTP 409");
        // Resume/engine reload clears acknowledgement: full recovery instructions must return.
        when(run.skillActivated()).thenReturn(false);
        assertThat(AutopilotTurnHandoff.forRun(run, 2, 8, "继续 task").instructions())
                .isEqualTo(fallback.instructions()).contains("discover_execution", "assess_execution");
    }

    @Test
    void normalContinuationContainsTaskDataWithoutTeachingRecoveryOrSpecRewrites() {
        var run = run();
        when(run.skillActivated()).thenReturn(true);
        var task = new TaskSnapshot("1.2", 2, "完成账户编辑和权限校验", false);
        var snapshot = new ChangeSnapshot("change-a", "revision-a", 1, 3, List.of(task), Map.of(), task);
        var message = AutopilotTurnHandoff.forRun(run, snapshot, "继续 task", null);
        assertThat(message.instructions()).contains("完成账户编辑和权限校验", "功能检查点", "代码、测试、配置或依赖输入变化",
                "有效且未变时引用原证据", "最终交付门禁和人工生产授权保留", "reusedCheckIds")
                .doesNotContain("VERIFY_GROUP", "abort_execution", "discover_execution", "HTTP 409",
                        "给任务 ID 后的描述补", "commit_execution");
        assertThat(message.instructions().length()).isLessThan(1500);
    }

    @ParameterizedTest
    @ValueSource(strings = {"IMPLEMENTATION_SCOPE_DRIFT", "DELTA_REQUIRED", "SCOPE_GAP", "BINDING_REQUIRED",
            "GOVERNANCE_CHANGE_MISMATCH", "进度上报 HTTP 409"})
    void acknowledgedSkillGetsRecoveryOnlyForAnActualRecoveryReason(String reason) {
        var run = run();
        when(run.skillActivated()).thenReturn(true);
        assertThat(AutopilotTurnHandoff.forRun(run, 2, 8, reason).instructions())
                .contains("scopeFingerprint", "abort_execution", "不中止他人执行", "版本化恢复入口");
        assertThat(AutopilotTurnHandoff.forRun(run, 2, 8, "已完成第 1409 项检查").instructions())
                .doesNotContain("abort_execution");
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
