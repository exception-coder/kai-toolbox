package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

import java.util.List;

/** 需求进度分析 Agent 的只读证据能力与固定回归样例。 */
public final class RequirementProgressCapabilityCatalog {

    private static final List<AgentCapability> CAPABILITIES = List.of(
            capability("tool:source_context", "source_context", "TOOL", "v1", "toolbox-llm",
                    "依据 URL、模块和结构收敛候选代码。", "READ_ONLY", "LOW"),
            capability("tool:source_read", "source_read", "TOOL", "v1", "toolbox-llm",
                    "读取候选源码和测试证据。", "READ_ONLY", "LOW"),
            capability("tool:source_search", "source_search", "TOOL", "v1", "toolbox-llm",
                    "在项目边界内补充精确检索。", "READ_ONLY", "MEDIUM"),
            capability("skill:graphify", "graphify", "SKILL", "v1", "Graphify",
                    "以知识图谱导航调用路径，结论仍需当前源码核验。", "INSTRUCTION_ONLY", "LOW"),
            capability("skill:backend-evidence", "backend-evidence", "SKILL", "2.2.0", "team-standards",
                    "区分 OpenSpec 行为、Graphify 实现与运行时事实。", "INSTRUCTION_ONLY", "LOW"));

    private RequirementProgressCapabilityCatalog() {
    }

    public static List<AgentCapability> capabilities() {
        return CAPABILITIES;
    }

    public static AgentEvaluationDataset evaluationDataset() {
        return new AgentEvaluationDataset("requirement-progress-regression-v1", "需求进度证据回归集",
                "PENDING_HUMAN_BASELINE", List.of(
                test("rp-001", "OpenSpec 已绑定", "按显式 change 的 tasks 核查完成度", "OpenSpec 任务映射"),
                test("rp-002", "OpenSpec 未绑定", "在未绑定 change 时分析源码", "降级模式"),
                test("rp-003", "无效完成声明", "模型引用不存在的文件或行号", "证据降级")));
    }

    private static AgentCapability capability(String id, String name, String type, String version, String source,
                                               String description, String permission, String risk) {
        return new AgentCapability(id, name, type, version, source, description, permission, risk,
                "REGISTERED", "能力契约已登记，运行时可用性由分析任务记录", List.of());
    }

    private static AgentEvaluationCase test(String id, String title, String question, String coverage) {
        return new AgentEvaluationCase(id, title, question, coverage, "READY");
    }
}
