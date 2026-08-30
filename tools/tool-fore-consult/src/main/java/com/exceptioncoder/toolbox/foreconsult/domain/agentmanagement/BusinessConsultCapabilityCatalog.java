package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 业务咨询 Agent 当前允许绑定的能力目录与安全约束。
 */
public final class BusinessConsultCapabilityCatalog {

    private static final List<AgentCapability> CAPABILITIES = List.of(
            capability("mcp:consult-readonly", "consult-readonly", "MCP_SERVER", "v1", "业务咨询模块",
                    "提供业务咨询源码证据读取能力，不包含写操作。", "READ_ONLY", "LOW",
                    List.of("tool:source_context", "tool:source_read", "tool:source_search")),
            capability("mcp:domain-knowledge", "domain-knowledge", "MCP_SERVER", "v1", "团队领域知识服务",
                    "提供已确认的领域术语与业务规范上下文。", "READ_ONLY", "LOW", List.of()),
            capability("tool:source_context", "source_context", "TOOL", "v1", "consult-readonly",
                    "收敛模块、符号及其关联上下文。", "READ_ONLY", "LOW", List.of()),
            capability("tool:source_read", "source_read", "TOOL", "v1", "consult-readonly",
                    "按明确目标读取源码证据。", "READ_ONLY", "LOW", List.of()),
            capability("tool:source_search", "source_search", "TOOL", "v1", "consult-readonly",
                    "在授权源码范围内检索实现证据。", "READ_ONLY", "MEDIUM", List.of()),
            capability("skill:backend-evidence", "backend-evidence", "SKILL", "2.1.0", "team-standards",
                    "约束 Agent 区分代码事实、行为规范与数据库运行事实。", "INSTRUCTION_ONLY", "LOW", List.of())
    );

    private BusinessConsultCapabilityCatalog() {
    }

    public static List<AgentCapability> capabilities() {
        return CAPABILITIES;
    }

    public static Map<String, AgentCapability> byId() {
        Map<String, AgentCapability> result = new LinkedHashMap<>();
        CAPABILITIES.forEach(capability -> result.put(capability.id(), capability));
        return Map.copyOf(result);
    }

    private static AgentCapability capability(String id, String name, String type, String version, String source,
                                               String description, String permission, String riskLevel,
                                               List<String> providedCapabilityIds) {
        return new AgentCapability(id, name, type, version, source, description, permission, riskLevel,
                "REGISTERED", "能力契约已登记，未进行 MCP 进程探活", providedCapabilityIds);
    }
}
