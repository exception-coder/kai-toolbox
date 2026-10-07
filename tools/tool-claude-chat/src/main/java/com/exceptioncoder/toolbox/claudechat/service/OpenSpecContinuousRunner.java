package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotDisposition;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotState;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionContext;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.OpenSpecExecutionPhase;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.service.ForgeQualityGateAdapter.Result;
import com.exceptioncoder.toolbox.claudechat.service.ForgeQualityGateAdapter.Status;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.TaskSnapshot;
import com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ValidationResult;
import org.springframework.stereotype.Service;
import com.exceptioncoder.toolbox.claudechat.service.governance.ProjectExecutionControlStore;

import java.nio.file.Path;
import java.util.Optional;

/** 仅依据持久上下文、OpenSpec 与门禁证据作出确定性的下一步决策。 */
@Service
public class OpenSpecContinuousRunner {
    private static final int MAX_DIAGNOSTIC_REPEATS = 1000;

    private final OpenSpecAutopilotAdapter openSpec;
    private final ForgeQualityGateAdapter qualityGate;

    public OpenSpecContinuousRunner(OpenSpecAutopilotAdapter openSpec, ForgeQualityGateAdapter qualityGate) {
        this.openSpec = openSpec;
        this.qualityGate = qualityGate;
    }

    public Decision decide(SessionAutopilotRun run, ChangeSnapshot snapshot) {
        OpenSpecExecutionContext context = run.context();
        if (ProjectExecutionControlStore.codingFirst(Path.of(context.projectRoot()))) {
            TaskSnapshot next = OpenSpecAutopilotAdapter.nextTask(Path.of(context.projectRoot()), snapshot.tasks());
            if (next == null) return new Decision(AutopilotState.STOPPED, "DEVELOPER_HANDOFF",
                    "授权编码已完成，待开发者集中验收；未执行验证或归档，验收勾选数不代表实现进度",
                    context, 0, null, snapshot.revision() + ":CODING_FIRST_HANDOFF");
            return Decision.continueWith(copy(context, snapshot.revision(), next.id(), next.applyOrdinal(),
                    OpenSpecExecutionPhase.APPLY, context.version() + 1),
                    "CODING_CONTINUE", "编码优先：继续未实现任务，不以验证证据阻断推进", 0);
        }
        if (ProjectExecutionControlStore.disabled(Path.of(context.projectRoot()))) {
            TaskSnapshot next = snapshot.nextTask();
            if (next != null) {
                boolean sameTask = next.id().equals(context.currentTaskId())
                        && snapshot.completedTasks() == run.completedTasks();
                int repeated = sameTask ? Math.min(run.noProgressCount(), MAX_DIAGNOSTIC_REPEATS - 1) + 1 : 0;
                return Decision.continueWith(copy(context, snapshot.revision(), next.id(), next.applyOrdinal(),
                        OpenSpecExecutionPhase.APPLY, context.version() + 1), "DEVELOPER_CONTINUE",
                        repeated >= 2 ? "当前 task 验收尚未收口，先核对已有成果并完成剩余项；继续开发"
                                : "项目编码门禁关闭，继续实际未完成的开发 task", repeated);
            }
            return developerHandoff(context, snapshot);
        }
        if (context.currentTaskId() != null) {
            TaskSnapshot current = snapshot.tasks().stream()
                    .filter(task -> context.currentTaskId().equals(task.id())).findFirst().orElse(null);
            if (current != null && current.applyOrdinal() != context.currentTaskOrdinal()) {
                return Decision.pause(context, "EXECUTION_CONTEXT_DRIFT",
                        "OpenSpec task 序号发生漂移，请重新绑定后恢复", run.noProgressCount());
            }
        }
        return switch (context.phase()) {
            case APPLY -> decideApply(run, snapshot);
            case VERIFY -> decideReportedPhase(run, snapshot, OpenSpecExecutionPhase.QUALITY_GATE,
                    "实现核验已通过，进入 Forge Quality Gate");
            case QUALITY_GATE -> decideQualityGate(run, snapshot);
            case STRICT_VALIDATE -> decideValidation(run, snapshot);
            case ARCHIVE -> decideArchive(run, snapshot);
            case DONE -> Decision.completed(context, snapshot.revision());
        };
    }

    /** 空闲巡检只决定开发阶段是否已结束，绝不运行质量检查或归档。 */
    public Optional<Decision> decideIdleRecovery(SessionAutopilotRun run, ChangeSnapshot snapshot) {
        if (ProjectExecutionControlStore.codingFirst(Path.of(run.context().projectRoot()))) {
            return OpenSpecAutopilotAdapter.nextTask(Path.of(run.context().projectRoot()), snapshot.tasks()) == null
                    ? Optional.of(decide(run, snapshot)) : Optional.empty();
        }
        if (snapshot.nextTask() != null) return Optional.empty();
        if (run.context().phase() == OpenSpecExecutionPhase.APPLY) {
            // APPLY only makes state decisions; retain its context-drift checks.
            return Optional.of(decide(run, snapshot));
        }
        return ProjectExecutionControlStore.disabled(Path.of(run.context().projectRoot()))
                ? Optional.of(developerHandoff(run.context(), snapshot)) : Optional.empty();
    }

    private Decision developerHandoff(OpenSpecExecutionContext context, ChangeSnapshot snapshot) {
        return new Decision(AutopilotState.STOPPED, "DEVELOPER_HANDOFF",
                "开发推进结束；项目编码门禁关闭，验证与归档未执行，人工事项保留待开发者验收",
                context, 0, null, snapshot.revision() + ":DEVELOPER_HANDOFF");
    }

    private Decision decideApply(SessionAutopilotRun run, ChangeSnapshot snapshot) {
        TaskSnapshot next = snapshot.nextTask();
        if (next == null) {
            return Decision.continueWith(advance(run.context(), OpenSpecExecutionPhase.VERIFY,
                    snapshot.revision()), "ADVANCE_PHASE", "全部本地开发 tasks 已完成，进入实现核验", 0);
        }
        boolean sameTask = next.id().equals(run.context().currentTaskId());
        boolean revisionChanged = !snapshot.revision().equals(run.context().changeRevision());
        int noProgress = sameTask && !revisionChanged ? run.noProgressCount() + 1 : 0;
        String reason = sameTask ? "当前 task 仍未完成，Runtime 自动续跑同一 task"
                : "上一 task 已确认完成，Runtime 已绑定下一 task";
        return Decision.continueWith(withTask(run.context(), next, snapshot.revision()),
                sameTask ? "RESUME_SAME_TASK" : "DISPATCH_NEXT_TASK", reason, noProgress);
    }

    private Decision decideReportedPhase(SessionAutopilotRun run, ChangeSnapshot snapshot,
                                         OpenSpecExecutionPhase nextPhase, String reason) {
        if (run.latestDisposition() == AutopilotDisposition.COMPLETE) {
            return Decision.continueWith(advance(run.context(), nextPhase, snapshot.revision()),
                    "ADVANCE_PHASE", reason, 0);
        }
        int noProgress = run.noProgressCount() + 1;
        if (noProgress >= run.maxNoProgress()) {
            return Decision.pause(run.context(), "OUTCOME_MISSING",
                    "Agent 未提交当前阶段通过证据，已暂停", noProgress);
        }
        return Decision.continueWith(corrective(run.context(), snapshot.revision()), "FIX_VERIFY",
                "实现核验尚未通过，返回 APPLY 修复并重试", noProgress);
    }

    private Decision decideQualityGate(SessionAutopilotRun run, ChangeSnapshot snapshot) {
        Result result = qualityGate.verify(Path.of(run.context().projectRoot()),
                run.context().repositoryIdentity());
        if (result.status() == Status.UNAVAILABLE) {
            return Decision.waiting(run.context(), "VERIFIER_UNAVAILABLE", result.detail(),
                    run.noProgressCount());
        }
        if (result.status() == Status.FAILED) {
            int noProgress = run.noProgressCount() + 1;
            if (noProgress >= run.maxNoProgress()) {
                return Decision.pause(run.context(), "QUALITY_GATE_FAILED",
                        "Forge Quality Gate 连续失败：" + bounded(result.detail()), noProgress);
            }
            return Decision.continueWith(corrective(run.context(), snapshot.revision()), "FIX_QUALITY_GATE",
                    "Forge Quality Gate 未通过，继续修复；证据指纹 " + shortFingerprint(result), noProgress);
        }
        return Decision.continueWith(advance(run.context(), OpenSpecExecutionPhase.STRICT_VALIDATE,
                snapshot.revision()), "ADVANCE_PHASE",
                "Forge Quality Gate 已通过；证据指纹 " + shortFingerprint(result), 0);
    }

    private Decision decideValidation(SessionAutopilotRun run, ChangeSnapshot snapshot) {
        ValidationResult result = openSpec.strictValidate(Path.of(run.context().projectRoot()),
                run.context().changeId());
        if (!result.passed()) {
            int noProgress = run.noProgressCount() + 1;
            if (noProgress >= run.maxNoProgress()) {
                return Decision.pause(run.context(), "STRICT_VALIDATE_FAILED",
                        "OpenSpec strict validation 连续失败：" + bounded(result.detail()), noProgress);
            }
            return Decision.continueWith(corrective(run.context(), snapshot.revision()), "FIX_VALIDATE",
                    "OpenSpec strict validation 失败，继续修复", noProgress);
        }
        if (!snapshot.pendingManualHandoffTasks().isEmpty()) {
            String taskIds = snapshot.pendingManualHandoffTasks().stream()
                    .map(TaskSnapshot::id).collect(java.util.stream.Collectors.joining("、"));
            return Decision.waiting(run.context(), "PRODUCTION_HANDOFF_REQUIRED",
                    "本地开发与质量门禁已通过；人工生产或方案核实任务 " + taskIds
                            + " 留待人工确认和执行，不自动勾选或归档", 0);
        }
        if (!run.autoArchive()) {
            return Decision.waiting(advance(run.context(), OpenSpecExecutionPhase.ARCHIVE,
                    snapshot.revision()), "ARCHIVE_APPROVAL_REQUIRED", "所有门禁已通过，等待用户授权归档", 0);
        }
        return Decision.continueWith(advance(run.context(), OpenSpecExecutionPhase.ARCHIVE,
                snapshot.revision()), "ADVANCE_PHASE", "执行已授权归档", 0);
    }

    private Decision decideArchive(SessionAutopilotRun run, ChangeSnapshot snapshot) {
        ValidationResult result = openSpec.archive(Path.of(run.context().projectRoot()), run.context().changeId());
        if (!result.passed()) {
            return Decision.waiting(run.context(), "ARCHIVE_FAILED",
                    "OpenSpec 归档未确认：" + bounded(result.detail()), run.noProgressCount() + 1);
        }
        return Decision.completed(advance(run.context(), OpenSpecExecutionPhase.DONE,
                snapshot.revision()), snapshot.revision());
    }

    private OpenSpecExecutionContext withTask(OpenSpecExecutionContext context, TaskSnapshot task,
                                              String revision) {
        return copy(context, revision, task.id(), task.applyOrdinal(), context.phase(), context.version() + 1);
    }

    private OpenSpecExecutionContext corrective(OpenSpecExecutionContext context, String revision) {
        return copy(context, revision, null, null, OpenSpecExecutionPhase.APPLY, context.version() + 1);
    }

    private OpenSpecExecutionContext advance(OpenSpecExecutionContext context, OpenSpecExecutionPhase phase,
                                              String revision) {
        return copy(context, revision, null, null, phase, context.version() + 1);
    }

    private OpenSpecExecutionContext copy(OpenSpecExecutionContext context, String revision, String taskId,
                                          Integer taskOrdinal, OpenSpecExecutionPhase phase, long version) {
        return new OpenSpecExecutionContext(context.projectRoot(), context.repositoryIdentity(),
                context.branchAtStart(), context.workspaceFingerprint(), context.changeId(), revision,
                taskId, taskOrdinal, phase, context.agentSessionRef(), context.generation(), version);
    }

    private String shortFingerprint(Result result) {
        String fingerprint = result.workspaceFingerprint();
        return fingerprint == null ? "unavailable" : fingerprint.substring(0, Math.min(12, fingerprint.length()));
    }

    private String bounded(String value) {
        if (value == null || value.isBlank()) {
            return "无诊断信息";
        }
        return value.length() <= 1_000 ? value : value.substring(value.length() - 1_000);
    }

    public record Decision(AutopilotState state, String code, String reason,
                           OpenSpecExecutionContext context, int noProgressCount,
                           String messageId, String progressFingerprint) {
        private static Decision continueWith(OpenSpecExecutionContext context, String code,
                                             String reason, int noProgressCount) {
            return new Decision(AutopilotState.ACTIVE, code, reason, context, noProgressCount,
                    continuationId(context), fingerprint(context));
        }

        private static Decision pause(OpenSpecExecutionContext context, String code,
                                      String reason, int noProgressCount) {
            return new Decision(AutopilotState.PAUSED, code, reason, context, noProgressCount,
                    null, fingerprint(context));
        }

        private static Decision waiting(OpenSpecExecutionContext context, String code,
                                        String reason, int noProgressCount) {
            return new Decision(AutopilotState.WAITING_USER, code, reason, context, noProgressCount,
                    null, fingerprint(context));
        }

        private static Decision completed(OpenSpecExecutionContext context, String revision) {
            OpenSpecExecutionContext done = context.phase() == OpenSpecExecutionPhase.DONE ? context
                    : new OpenSpecExecutionContext(context.projectRoot(), context.repositoryIdentity(),
                    context.branchAtStart(), context.workspaceFingerprint(), context.changeId(), revision,
                    null, null, OpenSpecExecutionPhase.DONE, context.agentSessionRef(), context.generation(),
                    context.version() + 1);
            return new Decision(AutopilotState.COMPLETED, "DONE", "OpenSpec change 已完成并归档",
                    done, 0, null, fingerprint(done));
        }

        private static String continuationId(OpenSpecExecutionContext context) {
            return context.generation() + ":" + context.phase() + ":" + context.currentTaskId();
        }

        private static String fingerprint(OpenSpecExecutionContext context) {
            return context.changeRevision() + ":" + context.phase() + ":" + context.currentTaskId();
        }
    }
}
