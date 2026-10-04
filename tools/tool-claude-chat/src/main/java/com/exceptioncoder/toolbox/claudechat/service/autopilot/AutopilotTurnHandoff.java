package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;

/** 将 Runtime 的持久监督身份交给 Agent，不读取或授予 Sidecar 写入权。 */
public final class AutopilotTurnHandoff {

    private AutopilotTurnHandoff() {
    }

    public static Message forRun(SessionAutopilotRun run, int completedTasks, int totalTasks, String reason) {
        String taskId = run.context().currentTaskId() == null ? "-" : run.context().currentTaskId();
        String task = "-".equals(taskId) ? "无" : taskId;
        String messageId = "autopilot:" + run.id() + ":" + run.context().generation() + ":"
                + run.context().phase().name().toLowerCase() + ":" + taskId + ":" + run.turnCount();
        String display = "自动推进 · " + run.context().changeId() + " · "
                + ("-".equals(taskId) ? run.context().phase().name() : "task " + taskId);
        String instructions = """
                你正在由 Forge Runtime 自动监督。不要请求用户说“继续”，也不要把单轮结束当作目标完成。
                Runtime run ID: %s
                FORGE_SUPERVISED_NO_DOCKER=1
                Active goal: %s
                Project root: %s
                OpenSpec change: %s
                Phase: %s
                Current task: %s
                Progress: %d/%d
                Runtime decision: %s
                Turn budget: %d/%d; no-progress budget: %d/%d

                此消息由 Forge Runtime 从当前会话持久运行记录生成；上面的 run ID、
                change、阶段和 task 就是本轮已绑定的自动监督上下文。
                forge.session_init 返回的 execution 是另一套代码写入执行绑定；
                execution=null 不表示上述自动监督未绑定，也不能据此要求重新选择 OpenSpec。
                如写入执行尚未绑定，先只读定位当前 task 的精确文件范围，再按
                resolve_execution_context → discover_execution → assess_execution 建立写入范围，
                复用本消息绑定的 change ID；取得写入许可前不得修改文件。
                若外部验证环境暂不可用，保留未验证项和证据，先完成当前 task 中
                不依赖该环境的步骤；有下一步时上报 CONTINUE、nextAction 和 remainingWork。
                自动推进期间不要启动 Docker Desktop、Docker Engine、WSL 或触发 Testcontainers；
                优先用 H2 MySQL 模式实际执行迁移，并完成静态清单、定向测试和装配检查。
                规格若未明确要求目标库实测，这些证据可完成本地开发 task；目标 MySQL/MariaDB
                实测作为发布前待验项记录，不能声称已通过或可以发布，不因其缺席停止开发。
                只有没有可执行步骤或必须等待用户决策时才上报 WAITING_USER 或 BLOCKED。
                若当前规格有不可越过的前置依赖，先记录具体问题和证据；批次中其他已选规格
                由 Runtime 预检后调度，不要自行切换 change，也不要混入其他规格的提交。
                自动推进的完成边界是绑定的 OpenSpec 目标，不是每个 task 的单独提交。
                共享前置尚未形成独立提交时，保留其依赖、责任范围和未验证项，继续获授权的
                独立工作；不得仅因“一任务一提交”约定上报 WAITING_USER 或停止推进。
                到可验证的交付节点再只提交自身写入范围内的文件，不夹带其他执行的修改。
                写入门禁冲突时先 inspect_execution_writer 查明占用者，不得绕过门禁。
                只执行上述绑定上下文中的下一步。完成或遇到真实阻塞前，遵守
                forge-openspec-continuous-execution Skill。yield 前必须调用
                forge.report_session_progress；不要从自然语言自行切换 change 或 task。
                """.formatted(run.id(), run.goal(), run.context().projectRoot(), run.context().changeId(),
                run.context().phase(), task, completedTasks, totalTasks, reason,
                run.turnCount(), run.maxTurns(), run.noProgressCount(), run.maxNoProgress());
        return new Message(messageId, display, "继续执行 Forge 已绑定的 OpenSpec 自动监督下一步。", instructions);
    }

    public record Message(String id, String display, String text, String instructions) {
    }
}
