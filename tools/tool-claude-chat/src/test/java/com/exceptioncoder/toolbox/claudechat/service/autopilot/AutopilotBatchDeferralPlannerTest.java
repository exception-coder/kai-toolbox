package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotCompletionPolicy;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotDisposition;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotState;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAutopilotRepository.Batch;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAutopilotRepository.DeferredChange;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.TaskSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ValidationResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AutopilotBatchDeferralPlannerTest {

    @Test
    void skipsUnreadyCandidateAndLeavesCurrentChangeForLater() {
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        Path root = Path.of("D:/repo");
        TaskSnapshot nextTask = new TaskSnapshot("2.1", 1, "next", false);
        when(openSpec.inspect(root, "auth")).thenReturn(new ChangeSnapshot("auth", "changed", 0, 1,
                List.of(nextTask), Map.of(), nextTask));
        when(openSpec.inspect(root, "organization")).thenReturn(new ChangeSnapshot("organization", "rev-c", 0, 1,
                List.of(nextTask), Map.of(), nextTask));
        when(openSpec.strictValidate(root, "organization")).thenReturn(new ValidationResult(true, "valid"));
        var planner = new AutopilotBatchDeferralPlanner(openSpec, new ObjectMapper());
        var batch = new Batch("[\"access\",\"auth\",\"organization\"]",
                "{\"auth\":\"rev-b\",\"organization\":\"rev-c\"}", 0);

        var plan = planner.plan(run(), batch, List.of(), "V090 需要先提交").orElseThrow();

        assertThat(plan.context().changeId()).isEqualTo("organization");
        assertThat(plan.reorderedChangeIdsJson()).isEqualTo("[\"organization\",\"auth\",\"access\"]");
        assertThat(plan.deferred()).contains(new DeferredChange("access", "V090 需要先提交"));
        assertThat(plan.deferred()).extracting(DeferredChange::changeId).contains("auth");
        assertThat(planner.plan(run(), batch, List.of(
                new DeferredChange("auth", "修订变化"),
                new DeferredChange("organization", "等待用户")), "V090 需要先提交")).isEmpty();
    }

    private SessionAutopilotRun run() {
        return run(OpenSpecExecutionPhase.APPLY);
    }

    @Test
    void manualHandoffRechecksDeferredDevelopmentAfterPrerequisiteCompletion() {
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        Path root = Path.of("D:/repo");
        TaskSnapshot task = new TaskSnapshot("2.1", 1, "local implementation", false);
        when(openSpec.inspect(root, "auth")).thenReturn(new ChangeSnapshot("auth", "new-rev", 0, 1,
                List.of(task), Map.of(), task));
        when(openSpec.strictValidate(root, "auth")).thenReturn(new ValidationResult(true, "valid"));
        var planner = new AutopilotBatchDeferralPlanner(openSpec, new ObjectMapper());
        var batch = new Batch("[\"access\",\"auth\"]", "{\"auth\":\"old-rev\"}", 0);
        var previous = List.of(new DeferredChange("auth", "等待 access 前置"));

        var plan = planner.afterManualHandoff(run(OpenSpecExecutionPhase.STRICT_VALIDATE), batch,
                previous, "人工确认留到批次末尾").orElseThrow();

        assertThat(plan.context().changeId()).isEqualTo("auth");
        assertThat(plan.context().changeRevision()).isEqualTo("new-rev");
        assertThat(plan.reorderedChangeIdsJson()).isEqualTo("[\"auth\",\"access\"]");
        assertThat(plan.deferred()).containsExactly(new DeferredChange("access", "人工确认留到批次末尾"));
        assertThat(planner.afterManualHandoff(run(), batch, previous, "manual")).isEmpty();
        when(openSpec.strictValidate(root, "auth")).thenReturn(new ValidationResult(false, "invalid"));
        assertThat(planner.afterManualHandoff(run(OpenSpecExecutionPhase.STRICT_VALIDATE), batch,
                previous, "manual")).isEmpty();
    }

    @Test
    void allManualTasksRemainUncompletedForFinalHandoff() {
        OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
        TaskSnapshot manual = new TaskSnapshot("5.1", 1, "[MANUAL_CONFIRMATION] source confirmation", false);
        when(openSpec.inspect(Path.of("D:/repo"), "auth")).thenReturn(new ChangeSnapshot("auth", "rev", 0, 1,
                List.of(manual), Map.of(), null));
        var planner = new AutopilotBatchDeferralPlanner(openSpec, new ObjectMapper());
        assertThat(planner.afterManualHandoff(run(OpenSpecExecutionPhase.STRICT_VALIDATE),
                new Batch("[\"access\",\"auth\"]", "{}", 0), List.of(), "manual")).isEmpty();
        assertThat(manual.done()).isFalse();
    }

    private SessionAutopilotRun run(OpenSpecExecutionPhase phase) {
        Instant now = Instant.now();
        var context = new OpenSpecExecutionContext("D:/repo", "repo", "main", "workspace", "access",
                "rev-a", "1.3", 3, phase, "agent", 1, 8);
        return new SessionAutopilotRun("run-1", "session-1", "finish IAM",
                AutopilotCompletionPolicy.OPEN_SPEC_STRICT, AutopilotState.ACTIVE, null, context,
                10, 180, 0, 3, true, true, "skill", "1", "hash", true,
                3, 10, AutopilotDisposition.WAITING_USER, "waiting", null, null, null, now,
                now, now.plusSeconds(3600), now);
    }
}
