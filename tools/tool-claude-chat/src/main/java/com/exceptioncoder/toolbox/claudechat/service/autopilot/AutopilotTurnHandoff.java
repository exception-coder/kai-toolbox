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
                区分“生产环境已接线并运行验收”和“本地代码已实现并通过适用回归”。
                规格未把生产环境接线列为当前 task 验收条件时，不得仅因尚未部署、未接入
                生产调度或目标库未验收而反复保持 task 未完成；如实记录后续接线与发布前验证。
                同一 task 连续续跑时，先逐项核对其明确的本地实现条件：已满足则勾选并报告
                COMPLETE；未满足则指出具体缺失的代码或测试并完成它，不要无限增加可选切片。
                不得把仅有接口草稿或测试替身、尚缺规格要求的本地实现误标为完成。
                自动推进顺序是先完成编码和本地基准测试，再集中整理生产验证及人工操作。
                生产环境接线、真实数据库迁移和升级测试只进入最终人工收尾清单；
                不在开发轮次自动执行，也不因清单未执行而反复续跑已通过本地验收的 task。
                若旧规格混写了开发与生产验收，先维护任务边界并保留生产项未执行证据，
                不得直接勾选尚缺本地实现的 task 或宣称发布验收通过。
                纯生产人工任务须在 OpenSpec task 描述开头使用 [MANUAL_PRODUCTION] 标记；
                混合任务先拆为本地开发项与该标记的人工项。Runtime 跳过标记项继续开发，
                本地质量门禁通过后停止自动归档，保留人工生产清单。
                遇到来源事实或业务细节不确定，先寻找保守、可回退且可本地测试的方案。
                有安全方案时自行选择并继续实现；在当前 change 的 design 或 validation 中登记
                待确认问题、现有证据、暂定假设、推荐方案、风险、测试及回访触发条件，
                并增加以 [MANUAL_CONFIRMATION] 开头的未勾选人工核实 task。
                若原 task 混合本地实现与来源方确认，先拆分；本地代码和测试通过后
                勾选开发 task，人工核实项留到最后统一交接，不得把假设写成已验证事实。
                来源键跨时间稳定性、变更日志完整性和权限等未知属性不得凭推测认定；
                优先采用全量对账、冲突检测或失败关闭等有界兜底，按真实开发验收条件收口。
                只有无安全可逆路径、需要不可逆操作或明确授权时才等待用户决策。
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
