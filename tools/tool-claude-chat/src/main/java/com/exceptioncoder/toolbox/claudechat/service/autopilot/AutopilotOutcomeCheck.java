package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotStep;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.AutopilotDisposition;
import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;

import java.util.Objects;

/** 核对次数来自已落库的派发步骤，不受模型改写摘要或服务重启影响。 */
public final class AutopilotOutcomeCheck {
    public static final int MAX_ATTEMPTS = 3;

    private AutopilotOutcomeCheck() { }

    public static int attempt(SessionAutopilotRun run, AutopilotStep step) {
        if (step == null || step.phase() != run.context().phase()
                || !Objects.equals(step.taskId(), run.context().currentTaskId())) {
            return 0;
        }
        return switch (step.disposition()) {
            case "OUTCOME_CHECK_1" -> 1;
            case "OUTCOME_CHECK_2" -> 2;
            case "OUTCOME_CHECK_3" -> 3;
            default -> 0;
        };
    }

    public static boolean unresolved(SessionAutopilotRun run, AutopilotStep previous) {
        if (run.latestDisposition() == AutopilotDisposition.FAILED) {
            return true;
        }
        if (run.latestDisposition() == null) {
            return RequirementAutopilot.applies(run) || attempt(run, previous) > 0;
        }
        return attempt(run, previous) > 0
                && run.latestDisposition() != AutopilotDisposition.COMPLETE
                && (run.latestEvidenceJson() == null || "[]".equals(run.latestEvidenceJson())
                    || Objects.equals(run.latestEvidenceJson(), previous.evidenceJson()));
    }

    public static AutopilotTurnHandoff.Message wrap(SessionAutopilotRun run, AutopilotStep step,
                                                   AutopilotTurnHandoff.Message original) {
        int attempt = attempt(run, step);
        if (attempt == 0) {
            return original;
        }
        return new AutopilotTurnHandoff.Message(original.id(), "自动推进 · 完成核对 " + attempt + "/3",
                "请核对当前任务是否完成；保留已完成工作，只处理剩余事项。",
                original.instructions() + "\n这是第 " + attempt + "/3 次完成核对，不是重放原任务。"
                        + "先检查现有代码、提交、执行结果和报告，明确目标及当前任务是否完成。"
                        + "已完成则用真实验证证据报告 COMPLETE；尚未完成且可安全继续，就只补齐剩余工作并报告 CONTINUE。"
                        + "不要重复已完成的写入、迁移、发布或其他外部操作，也不要用改写摘要冒充新增证据。"
                        + "严格规格仍以权威任务和阶段验收为准，不能仅凭口头完成跳过。"
                        + "必要权限、重启、发布或真实阻塞仍报告 WAITING_USER/BLOCKED。"
                        + "连续三次核对仍失败或不能确认后，Runtime 会挂起，等待用户核对再恢复。\n");
    }
}
