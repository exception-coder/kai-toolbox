package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

import java.util.List;

/** 需求规格分析 Agent 的证据、OpenSpec 编排能力与回归样例。 */
public final class RequirementSpecificationCapabilityCatalog {

    private static final List<AgentCapability> CAPABILITIES = List.of(
            capability("tool:source_context", "source_context", "TOOL", "v1", "toolbox-llm",
                    "依据项目、模块和 URL 路由收敛规格所需源码上下文。", "READ_ONLY", "LOW"),
            capability("skill:graphify", "graphify", "SKILL", "v1", "Graphify",
                    "查询代码结构和调用路径，并由当前源码继续核验。", "INSTRUCTION_ONLY", "LOW"),
            capability("skill:backend-evidence", "backend-evidence", "SKILL", "2.2.0", "team-standards",
                    "区分业务规格、代码结构、DDL 与运行证据。", "INSTRUCTION_ONLY", "LOW"),
            capability("workflow:openspec", "openspec", "WORKFLOW", "v1", "OpenSpec",
                    "同步 proposal、specs、design 和 tasks，并执行严格校验。", "DETERMINISTIC", "MEDIUM"));

    private RequirementSpecificationCapabilityCatalog() {
    }

    public static List<AgentCapability> capabilities() {
        return CAPABILITIES;
    }

    public static AgentEvaluationDataset evaluationDataset() {
        return new AgentEvaluationDataset("requirement-specification-regression-v1", "需求规格证据回归集",
                "PENDING_HUMAN_BASELINE", List.of(
                test("rs-001", "URL 可定位", "按路由映射、Graphify 和源码生成规格", "项目证据路由"),
                test("rs-002", "项目证据缺失", "显式保留假设与开放问题", "事实边界"),
                test("rs-003", "规格已确认", "同步 OpenSpec 计划并严格校验", "OpenSpec 产物同步")));
    }

    private static AgentCapability capability(String id, String name, String type, String version, String source,
                                               String description, String permission, String risk) {
        return new AgentCapability(id, name, type, version, source, description, permission, risk,
                "REGISTERED", "能力契约已登记，运行时可用性由规格运行记录", List.of());
    }

    private static AgentEvaluationCase test(String id, String title, String question, String coverage) {
        return new AgentEvaluationCase(id, title, question, coverage, "READY");
    }
}
