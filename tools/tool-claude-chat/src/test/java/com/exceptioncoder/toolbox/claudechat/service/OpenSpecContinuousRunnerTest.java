package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotCompletionPolicy;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotDisposition;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotState;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.service.ForgeQualityGateAdapter.Result;
import com.exceptioncoder.toolbox.claudechat.service.ForgeQualityGateAdapter.Status;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.TaskSnapshot;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OpenSpecContinuousRunnerTest {

    private final OpenSpecAutopilotAdapter openSpec = mock(OpenSpecAutopilotAdapter.class);
    private final ForgeQualityGateAdapter qualityGate = mock(ForgeQualityGateAdapter.class);
    private final OpenSpecContinuousRunner runner = new OpenSpecContinuousRunner(openSpec, qualityGate);

    @Test
    void resumesSameUncheckedTaskWithoutTrustingAgentCompletionProse() {
        SessionAutopilotRun run = run(OpenSpecExecutionPhase.APPLY, "6.4", 28,
                AutopilotDisposition.COMPLETE, "revision-a", 0);
        ChangeSnapshot snapshot = snapshot("revision-a", List.of(
                new TaskSnapshot("6.3", 27, "done", true),
                new TaskSnapshot("6.4", 28, "pending", false)));

        OpenSpecContinuousRunner.Decision decision = runner.decide(run, snapshot);

        assertThat(decision.state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(decision.code()).isEqualTo("RESUME_SAME_TASK");
        assertThat(decision.context().currentTaskId()).isEqualTo("6.4");
        verifyNoInteractions(openSpec, qualityGate);
    }

    @Test
    void persistsNextHumanTaskAndApplyOrdinalAfterCurrentTaskCompletes() {
        SessionAutopilotRun run = run(OpenSpecExecutionPhase.APPLY, "6.4", 28,
                AutopilotDisposition.CONTINUE, "revision-a", 0);
        ChangeSnapshot snapshot = snapshot("revision-b", List.of(
                new TaskSnapshot("6.4", 28, "done", true),
                new TaskSnapshot("6.5", 29, "next", false)));

        OpenSpecContinuousRunner.Decision decision = runner.decide(run, snapshot);

        assertThat(decision.code()).isEqualTo("DISPATCH_NEXT_TASK");
        assertThat(decision.context().currentTaskId()).isEqualTo("6.5");
        assertThat(decision.context().currentTaskOrdinal()).isEqualTo(29);
    }

    @Test
    void executesFreshRuntimeQualityGateAndAdvancesOnlyOnPass() {
        SessionAutopilotRun run = run(OpenSpecExecutionPhase.QUALITY_GATE, null, null,
                AutopilotDisposition.COMPLETE, "revision-a", 0);
        ChangeSnapshot snapshot = snapshot("revision-a", List.of());
        when(qualityGate.verify(java.nio.file.Path.of("D:/repo"), "D:/repo"))
                .thenReturn(new Result(Status.PASSED, "1234567890abcdef", "passed"));

        OpenSpecContinuousRunner.Decision decision = runner.decide(run, snapshot);

        assertThat(decision.state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(decision.context().phase()).isEqualTo(OpenSpecExecutionPhase.STRICT_VALIDATE);
        assertThat(decision.reason()).contains("1234567890ab");
    }

    @Test
    void pausesForUnavailableVerifierInsteadOfDowngradingEvidence() {
        SessionAutopilotRun run = run(OpenSpecExecutionPhase.QUALITY_GATE, null, null,
                AutopilotDisposition.COMPLETE, "revision-a", 0);
        when(qualityGate.verify(java.nio.file.Path.of("D:/repo"), "D:/repo"))
                .thenReturn(new Result(Status.UNAVAILABLE, null, "missing verifier"));

        OpenSpecContinuousRunner.Decision decision = runner.decide(run, snapshot("revision-a", List.of()));

        assertThat(decision.state()).isEqualTo(AutopilotState.WAITING_USER);
        assertThat(decision.code()).isEqualTo("VERIFIER_UNAVAILABLE");
    }

    @Test
    void returnsToApplyWhenQualityGateNeedsARepair() {
        SessionAutopilotRun run = run(OpenSpecExecutionPhase.QUALITY_GATE, null, null,
                AutopilotDisposition.COMPLETE, "revision-a", 0);
        when(qualityGate.verify(java.nio.file.Path.of("D:/repo"), "D:/repo"))
                .thenReturn(new Result(Status.FAILED, "1234567890abcdef", "test failed"));

        OpenSpecContinuousRunner.Decision decision = runner.decide(run, snapshot("revision-a", List.of()));

        assertThat(decision.state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(decision.code()).isEqualTo("FIX_QUALITY_GATE");
        assertThat(decision.context().phase()).isEqualTo(OpenSpecExecutionPhase.APPLY);
    }

    @Test
    void returnsToApplyWhenStrictValidationNeedsARepair() {
        SessionAutopilotRun run = run(OpenSpecExecutionPhase.STRICT_VALIDATE, null, null,
                AutopilotDisposition.COMPLETE, "revision-a", 0);
        when(openSpec.strictValidate(java.nio.file.Path.of("D:/repo"), "session-autopilot"))
                .thenReturn(new OpenSpecAutopilotAdapter.ValidationResult(false, "invalid"));

        OpenSpecContinuousRunner.Decision decision = runner.decide(run, snapshot("revision-a", List.of()));

        assertThat(decision.state()).isEqualTo(AutopilotState.ACTIVE);
        assertThat(decision.code()).isEqualTo("FIX_VALIDATE");
        assertThat(decision.context().phase()).isEqualTo(OpenSpecExecutionPhase.APPLY);
    }

    @Test
    void strictSuccessWaitsForArchiveApprovalWhenAutoArchiveWasNotAuthorized() {
        SessionAutopilotRun run = withAutoArchive(run(OpenSpecExecutionPhase.STRICT_VALIDATE, null, null,
                AutopilotDisposition.COMPLETE, "revision-a", 0), false);
        when(openSpec.strictValidate(java.nio.file.Path.of("D:/repo"), "session-autopilot"))
                .thenReturn(new OpenSpecAutopilotAdapter.ValidationResult(true, "valid"));

        OpenSpecContinuousRunner.Decision decision = runner.decide(run, snapshot("revision-a", List.of()));

        assertThat(decision.state()).isEqualTo(AutopilotState.WAITING_USER);
        assertThat(decision.code()).isEqualTo("ARCHIVE_APPROVAL_REQUIRED");
        assertThat(decision.context().phase()).isEqualTo(OpenSpecExecutionPhase.ARCHIVE);
    }

    @Test
    void rejectsTaskOrdinalDriftBeforeDispatch() {
        SessionAutopilotRun run = run(OpenSpecExecutionPhase.APPLY, "6.4", 28,
                AutopilotDisposition.CONTINUE, "revision-a", 0);
        ChangeSnapshot snapshot = snapshot("revision-b",
                List.of(new TaskSnapshot("6.4", 29, "moved", false)));

        OpenSpecContinuousRunner.Decision decision = runner.decide(run, snapshot);

        assertThat(decision.state()).isEqualTo(AutopilotState.PAUSED);
        assertThat(decision.code()).isEqualTo("EXECUTION_CONTEXT_DRIFT");
    }

    @Test
    void withholdsDoneUntilArchiveIsConfirmed() {
        SessionAutopilotRun run = run(OpenSpecExecutionPhase.ARCHIVE, null, null,
                AutopilotDisposition.COMPLETE, "revision-a", 0);
        when(openSpec.archive(java.nio.file.Path.of("D:/repo"), "session-autopilot"))
                .thenReturn(new OpenSpecAutopilotAdapter.ValidationResult(false, "archive not confirmed"));

        OpenSpecContinuousRunner.Decision decision = runner.decide(run, snapshot("revision-a", List.of()));

        assertThat(decision.state()).isEqualTo(AutopilotState.WAITING_USER);
        assertThat(decision.code()).isEqualTo("ARCHIVE_FAILED");
        assertThat(decision.context().phase()).isEqualTo(OpenSpecExecutionPhase.ARCHIVE);
    }

    @Test
    void completesOnlyAfterSuccessfulArchive() {
        SessionAutopilotRun run = run(OpenSpecExecutionPhase.ARCHIVE, null, null,
                AutopilotDisposition.COMPLETE, "revision-a", 0);
        when(openSpec.archive(java.nio.file.Path.of("D:/repo"), "session-autopilot"))
                .thenReturn(new OpenSpecAutopilotAdapter.ValidationResult(true, "archived"));

        OpenSpecContinuousRunner.Decision decision = runner.decide(run, snapshot("revision-a", List.of()));

        assertThat(decision.state()).isEqualTo(AutopilotState.COMPLETED);
        assertThat(decision.code()).isEqualTo("DONE");
        assertThat(decision.context().phase()).isEqualTo(OpenSpecExecutionPhase.DONE);
    }

    private ChangeSnapshot snapshot(String revision, List<TaskSnapshot> tasks) {
        TaskSnapshot next = tasks.stream().filter(task -> !task.done()).findFirst().orElse(null);
        int complete = (int) tasks.stream().filter(TaskSnapshot::done).count();
        return new ChangeSnapshot("session-autopilot", revision, complete, tasks.size(), tasks, Map.of(), next);
    }

    private SessionAutopilotRun run(OpenSpecExecutionPhase phase, String taskId, Integer ordinal,
                                    AutopilotDisposition disposition, String revision, int noProgress) {
        Instant now = Instant.parse("2026-09-02T17:00:00Z");
        OpenSpecExecutionContext context = new OpenSpecExecutionContext(
                "D:/repo", "D:/repo", "main", "workspace", "session-autopilot", revision,
                taskId, ordinal, phase, "agent-1", 1, 3);
        return new SessionAutopilotRun("run-1", "session-1", "完成 change",
                AutopilotCompletionPolicy.OPEN_SPEC_STRICT, AutopilotState.ACTIVE, null, context,
                2, 60, noProgress, 3, true, true, ".agents/skills", "1.0.0", "hash", true,
                1, 2, disposition, "summary", "next", "[]", "[]", now,
                now, now.plusSeconds(3600), now);
    }

    private SessionAutopilotRun withAutoArchive(SessionAutopilotRun run, boolean autoArchive) {
        return new SessionAutopilotRun(run.id(), run.sessionId(), run.goal(), run.completionPolicy(), run.state(),
                run.reason(), run.context(), run.turnCount(), run.maxTurns(), run.noProgressCount(),
                run.maxNoProgress(), autoArchive, run.skillActivated(), run.skillPath(), run.skillVersion(),
                run.skillFingerprint(), run.runtimeSupervision(), run.completedTasks(), run.totalTasks(),
                run.latestDisposition(), run.latestSummary(), run.latestNextAction(),
                run.latestRemainingWorkJson(), run.latestEvidenceJson(), run.latestReportAt(), run.startedAt(),
                run.deadlineAt(), run.updatedAt());
    }
}
