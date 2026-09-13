package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

import java.util.List;

/** 一个主 Agent 内的可配置语义步骤，不代表独立模型运行或独立权限沙箱。 */
public record ConsultWorkflowNode(
        String id, String name, boolean enabled, String condition,
        String instructions, String queryConstraints, String outputContract,
        List<String> tools, List<String> mcpServers
) {
    public ConsultWorkflowNode {
        tools = tools == null ? null : List.copyOf(tools);
        mcpServers = mcpServers == null ? null : List.copyOf(mcpServers);
    }
}
