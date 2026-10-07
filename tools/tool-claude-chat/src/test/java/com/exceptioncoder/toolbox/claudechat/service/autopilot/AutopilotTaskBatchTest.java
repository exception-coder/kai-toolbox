package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.TaskSnapshot;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import com.exceptioncoder.toolbox.claudechat.service.ContinuousExecutionSkillProvisioner;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AutopilotTaskBatchTest {
    @Test
    void projectCadenceLimitsBatchAndDisabledGatesKeepAcceptanceContext(@TempDir Path root) {
        var run = mock(SessionAutopilotRun.class);
        when(run.context()).thenReturn(new OpenSpecExecutionContext(root.toString(), "repo", "main", "fp",
                "change-a", "revision", "1.1", 1, OpenSpecExecutionPhase.APPLY, "thread", 1, 0));
        when(run.id()).thenReturn("checkpoint");
        when(run.noProgressCount()).thenReturn(3);
        var snapshot = snapshot("[VERIFY_GROUP:a] 完成账户编辑和权限校验", "[VERIFY_GROUP:a] 完成审计记录");
        var grouped = AutopilotTurnHandoff.forRun(run, snapshot, "continue");
        assertThat(grouped.instructions()).contains("功能检查点", "完成账户编辑和权限校验", "完成审计记录",
                "当前任务已多次派发", "有效且未变时引用原证据");
        com.exceptioncoder.toolbox.claudechat.service.governance.ProjectExecutionControlStore.update(root, 0, false,
                "developer", "逐任务验证", com.exceptioncoder.toolbox.claudechat.service.governance.VerificationCadence.PER_TASK);
        var single = AutopilotTurnHandoff.forRun(run, snapshot, "continue");
        assertThat(single.instructions()).contains("验证节奏：逐任务", "完成账户编辑和权限校验", "编码门禁已由开发者关闭")
                .contains("前端先完成当前可交付功能", "关键权限、事务、迁移及失败修复及时定向验证",
                        "AI 原生推进", "原要求保留为未完成后续项", "必要权限、数据安全及主流程正确性不能后置")
                .doesNotContain("完成审计记录", "Runtime 本轮授权验证批次", "功能检查点（默认）");
        assertThat(single.display()).doesNotContain("合并验证");
    }
    @Test
    void provisionedBatchInstructionsMatchReportedVersion(@TempDir Path root) throws Exception {
        var result = new ContinuousExecutionSkillProvisioner().provision(root);
        assertThat(result.ready()).isTrue();
        for (String installed : result.installedPaths()) {
            assertThat(Files.readString(root.resolve(installed)))
                    .contains("x-forge-version: " + result.version(), "[VERIFY_GROUP:name]", "reusedCheckIds",
                            "page and API wiring", "Do not report deferred checks as passed",
                            "explicit unfinished follow-up tasks", "deferred requirements stay unchecked");
        }
    }

    private OpenSpecExecutionContext context(String revision, OpenSpecExecutionPhase phase) {
        return new OpenSpecExecutionContext("D:/batch-fixture", "repo", "main", "fp", "change-a", revision,
                "1.1", 1, phase, "thread", 1, 0);
    }

    private ChangeSnapshot snapshot(String... descriptions) {
        var tasks = IntStream.range(0, descriptions.length)
                .mapToObj(i -> new TaskSnapshot("1." + (i + 1), i + 1, descriptions[i], false)).toList();
        return new ChangeSnapshot("change-a", "revision", 0, tasks.size(), tasks, Map.of(), tasks.getFirst());
    }

    @Test
    void relatedTasksAreBatchedButManualAndDifferentGroupsStopTheBatch() {
        var context = context("revision", OpenSpecExecutionPhase.APPLY);
        var batch = snapshot("[VERIFY_GROUP:login] API", "[VERIFY_GROUP:login] service",
                "[MANUAL_CONFIRMATION] source", "[VERIFY_GROUP:login] later");
        assertThat(AutopilotTaskBatch.select(context, batch)).extracting(TaskSnapshot::id)
                .containsExactly("1.1", "1.2");
        assertThat(AutopilotTaskBatch.select(context,
                snapshot("[VERIFY_GROUP:a] API", "[VERIFY_GROUP:b] service"))).hasSize(1);
        assertThat(AutopilotTaskBatch.select(context, snapshot("API", "service"))).hasSize(1);
        assertThat(AutopilotTaskBatch.select(context, snapshot("[VERIFY_GROUP:a] API",
                "[VERIFY_GROUP:a] [MANUAL_PRODUCTION] deploy"))).hasSize(1);
    }

    @Test
    void changedRevisionAndVerificationPhaseCannotAuthorizeBatchWork() {
        var snapshot = snapshot("[VERIFY_GROUP:a] API", "[VERIFY_GROUP:a] service");
        assertThat(AutopilotTaskBatch.select(context("stale", OpenSpecExecutionPhase.APPLY), snapshot)).isEmpty();
        assertThat(AutopilotTaskBatch.select(context("revision", OpenSpecExecutionPhase.VERIFY), snapshot)).isEmpty();
        assertThat(AutopilotTaskBatch.select(context("revision", OpenSpecExecutionPhase.APPLY),
                snapshot("[MANUAL_PRODUCTION] deploy"))).isEmpty();
    }

    @Test
    void batchIsBoundedAndHandoffCarriesTheExactAuthorizedIds() {
        var snapshot = snapshot(IntStream.range(0, 9).mapToObj(i -> "[VERIFY_GROUP:a] code " + i)
                .toArray(String[]::new));
        var run = mock(SessionAutopilotRun.class);
        when(run.context()).thenReturn(context("revision", OpenSpecExecutionPhase.APPLY));
        when(run.id()).thenReturn("run-batch");
        when(run.skillActivated()).thenReturn(true);
        assertThat(AutopilotTaskBatch.select(run.context(), snapshot)).hasSize(6);
        var message = AutopilotTurnHandoff.forRun(run, snapshot, "continue");
        assertThat(message.display()).contains("合并验证 6 项");
        assertThat(message.instructions()).contains("Runtime 本轮授权验证批次：1.1, 1.2, 1.3, 1.4, 1.5, 1.6")
                .doesNotContain("1.7").contains("不扩大 writer 文件范围", "按证据逐项勾选");
    }
}
