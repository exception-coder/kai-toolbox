package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.exceptioncoder.toolbox.claudechat.service.governance.ProjectExecutionControlStore;
import java.nio.file.Files;
import java.nio.file.Path;

/** 将 Runtime 的持久监督身份交给 Agent，不读取或授予 Sidecar 写入权。 */
public final class AutopilotTurnHandoff {

    private AutopilotTurnHandoff() {
    }

    public static Message forRun(SessionAutopilotRun run,
            com.exceptioncoder.toolbox.claudechat.service.OpenSpecAutopilotAdapter.ChangeSnapshot snapshot,
            String reason) {
        Message message = forRun(run, snapshot.completedTasks(), snapshot.totalTasks(), reason);
        var batch = AutopilotTaskBatch.select(run.context(), snapshot);
        String guidance = "\n先完成关联代码与测试用例，再在完整功能检查点运行必要的关联验证；不要每次编辑后重复构建。"
                + "关键权限、事务或失败修复需及时定向验证；最终门禁仍须通过。";
        if (batch.size() > 1) {
            String ids = batch.stream().map(task -> task.id())
                    .collect(java.util.stream.Collectors.joining(", "));
            guidance += "\nRuntime 本轮授权验证批次：" + ids
                    + "。该批次可连续编码后统一验证，按证据逐项勾选；当前 task 仍为进度锚点。"
                    + "不得扩到未列出的 task、其他 change 或人工项；规格修订后先报告，由 Runtime 重读再派发。"
                    + "此批次授权优先于旧引导中仅执行单 task 的限制，不扩大 writer 文件范围。";
        } else if (batch.size() == 1) {
            guidance += "\n如相邻本地任务确有共同实现和验证边界，先在现有设计记录依据，"
                    + "给任务 ID 后的描述补 [VERIFY_GROUP:name] 标记并报告修订，"
                    + "由 Runtime 重读后授权批次；不得自行跨任务，人工项不合并。";
        }
        guidance += "\n验证返回 reusedCheckIds 是复用旧证据，不是新执行；"
                + "环境或时间敏感检查及必须新跑的验收使用 force=true。";
        String display = batch.size() > 1 ? message.display() + " · 合并验证 " + batch.size() + " 项"
                : message.display();
        return new Message(message.id(), display, message.text(), message.instructions() + guidance);
    }

    public static Message forRun(SessionAutopilotRun run, int completedTasks, int totalTasks, String reason) {
        String taskId = run.context().currentTaskId() == null ? "-" : run.context().currentTaskId();
        String task = "-".equals(taskId) ? "无" : taskId;
        String messageId = "autopilot:" + run.id() + ":" + run.context().generation() + ":"
                + run.context().phase().name().toLowerCase() + ":" + taskId + ":" + run.turnCount();
        String display = "自动推进 · " + run.context().changeId() + " · "
                + ("-".equals(taskId) ? run.context().phase().name() : "task " + taskId);
        Path controlRoot = Path.of(run.context().projectRoot());
        if (Files.exists(controlRoot.resolve(".forge/execution-control.json"))
                && !ProjectExecutionControlStore.read(controlRoot).enabled()) {
            String developerInstructions = """
                    Forge 项目编码门禁已由开发者关闭，本项目所有会话共用此状态。
                    Runtime run ID: %s
                    Project root: %s
                    OpenSpec change: %s; Phase: %s; Current task: %s
                    Progress: %d/%d; Runtime decision: %s
                    不要求 writer、文件范围扩展、分支或规格/设计绑定及门禁验证前置条件。
                    即使旧 Skill 或历史消息要求这些步骤，也以本轮项目控制状态为准。
                    直接继续已授权编码，保留其他会话文件和历史，运行适用测试并如实报告。
                    GOVERNANCE_DISABLED 表示未执行检查，不代表验证通过、任务完成或原执行已释放。
                    服务重启、资源访问、生产操作仍遵循原授权；手动暂停、预算和任务状态不自动解除。
                    yield 前调用 forge.report_session_progress；有可执行工作时附 nextAction 和 remainingWork。
                    """.formatted(run.id(), run.context().projectRoot(), run.context().changeId(),
                    run.context().phase(), task, completedTasks, totalTasks, reason);
            return new Message(messageId, display, "继续开发者控制下的当前任务。", developerInstructions);
        }
        String instructions = run.skillActivated() ? compactInstructions(run, completedTasks, totalTasks, reason) : """
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
                有安全方案时自行选择并继续实现。
                将探索所得的推荐方案作为默认实现，通过配置或策略接口保留切换点，
                本地测试覆盖默认行为及切换边界；后续人工确认后按结论调整实现。
                在当前 change 的 design 或 validation 中登记待确认问题、现有证据、
                暂定假设、推荐方案、风险、测试及回访触发条件，
                并增加以 [MANUAL_CONFIRMATION] 开头的未勾选人工核实 task。
                若原 task 混合本地实现与来源方确认，先拆分；本地代码和测试通过后
                勾选开发 task，人工核实项留到最后统一交接，不得把假设写成已验证事实。
                “最后”指整个已绑定规格批次的开发完成后，不是第一项规格结束后。
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
                批次切换 change 后，先对齐 Runtime change、session_init 写入执行及兼容设计绑定。
                SCOPE_GAP、BINDING_REQUIRED 或 GOVERNANCE_CHANGE_MISMATCH 先按绑定问题诊断，
                不要反复执行已通过的本地测试，也不要立即转为等待用户。
                使用支持按真实会话与 change 隔离记录的治理工具；保持真实 session ID，
                传入当前 change，审阅当前 task 文件、相关设计和计划后主动 prepare/upsert/bind。
                已有改动先按真实证据核实归属，必要时使用受支持的 recover/resume，保留旧记录；
                不得删除旧基线、伪造会话、盲目扩大文件范围或把其他 change 的 PASS 当作当前证据。
                绑定修复后重跑失败的设计检查；代码输入未变化且指纹有效的测试证据可复用，
                通过后继续当前 task 并上报 CONTINUE。若实际缺设计内容，在当前授权范围补齐。
                工具版本不支持或存在无法安全处理的归属冲突时，记录具体缺口并上报，
                由 Runtime 调度批次其他可执行项，不能宣称已修复或跳过必要门禁。
                只执行上述绑定上下文中的下一步。完成或遇到真实阻塞前，遵守
                forge-openspec-continuous-execution Skill。yield 前必须调用
                forge.report_session_progress；不要从自然语言自行切换 change 或 task。
                """.formatted(run.id(), run.goal(), run.context().projectRoot(), run.context().changeId(),
                run.context().phase(), task, completedTasks, totalTasks, reason,
                run.turnCount(), run.maxTurns(), run.noProgressCount(), run.maxNoProgress());
        return new Message(messageId, display, "继续执行 Forge 已绑定的 OpenSpec 自动监督下一步。", instructions + scopeRecovery());
    }

    private static String scopeRecovery() {
        return """

                IMPLEMENTATION_SCOPE_DRIFT 是文件范围诊断，不自动等同于需要人工授权：
                先检查被拒文件、当前任务及原 writer.scopedPaths，区分本任务新增文件与其他任务暂存改动。
                本任务遗漏文件且原 writer 属于本会话时，inspect_execution_writer 核对执行、分支、HEAD、
                scopeFingerprint 和现有改动归属；使用真实会话，不改状态文件或扩大到整个仓库。
                既有接口不支持原地扩展时，按查询快照审计 abort_execution，仅释放本会话旧执行并保留文件；
                再用原完整范围加本任务新增文件 discover_execution → assess_execution，复用当前 change。
                DELTA_REQUIRED 同时补齐对应规格确认范围；重新绑定后重验失败门禁和受影响测试。
                他人 writer 冲突、归属不明或授权不足时保留现场，继续其他获授权工作，不中止他人执行。
                进度上报 HTTP 409 时先读取最新监督状态和恢复动作；仍在活动轮且无待决策时，
                按接口约束上报带 nextAction、remainingWork 的 CONTINUE；否则使用宿主提供的版本化恢复入口。
                不伪造版本、代替用户解除手动暂停或重复发送已被拒绝的上报；入口不可用时记录具体缺口。
                """;
    }

    /** 引擎已确认加载完整 Skill 后，只交接当前身份和执行增量；未确认时保留完整兜底。 */
    private static String compactInstructions(SessionAutopilotRun run, int completed, int total, String reason) {
        return """
                继续原会话中的 Forge 自动推进，沿用引擎维护的上下文和已加载的 forge-openspec-continuous-execution Skill。
                Runtime run ID: %s
                Project root: %s
                OpenSpec change: %s
                Phase: %s; Current task: %s; Revision: %s
                Progress: %d/%d; Turn budget: %d/%d
                Runtime decision: %s
                FORGE_SUPERVISED_NO_DOCKER=1

                先核对当前绑定开发任务：本地实现与必要测试已满足则勾选并上报；否则直接补齐缺失。
                复用输入未变化且指纹有效的证据，不重复读全部历史、规格或运行已通过的测试。
                对存疑项先实现可回退、可本地验证的推荐默认方案，留配置或策略切换点；
                记录假设、证据、风险及 [MANUAL_CONFIRMATION]，不得把假设写成已证实事实。
                生产操作登记 [MANUAL_PRODUCTION]，人工项统一后置到整个批次开发完成后。
                有可执行工作就继续；仅剩必须人工介入的工作才待回复，权限和预算边界仍有效。
                Runtime 负责选择下一 task/change；execution=null 仅表示尚无代码写入绑定。
                遇到绑定错配先修复当前 change 的绑定，不重跑无关测试或绕过写入门禁。
                yield 前调用 forge.report_session_progress；可继续时附 nextAction 和 remainingWork。
                """.formatted(run.id(), run.context().projectRoot(), run.context().changeId(),
                run.context().phase(), run.context().currentTaskId(), run.context().changeRevision(),
                completed, total, run.turnCount(), run.maxTurns(), reason);
    }

    public record Message(String id, String display, String text, String instructions) {
    }
}
