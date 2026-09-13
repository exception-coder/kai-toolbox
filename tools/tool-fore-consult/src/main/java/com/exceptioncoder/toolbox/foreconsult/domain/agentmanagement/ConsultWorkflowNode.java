package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

import java.util.List;

/** 一个主 Agent 内的可配置语义步骤，不代表独立模型运行或独立权限沙箱。 */
public record ConsultWorkflowNode(
        String id, String name, boolean enabled, String condition,
        String instructions, String queryConstraints, String outputContract,
        List<String> tools, List<String> mcpServers, List<String> resourceBindingIds
) {
    public ConsultWorkflowNode(String id, String name, boolean enabled, String condition,
                               String instructions, String queryConstraints, String outputContract,
                               List<String> tools, List<String> mcpServers) {
        this(id, name, enabled, condition, instructions, queryConstraints, outputContract, tools, mcpServers, List.of());
    }

    public ConsultWorkflowNode {
        resourceBindingIds = resourceBindingIds == null ? List.of() : List.copyOf(resourceBindingIds);
        if (resourceBindingIds.size() > 100 || resourceBindingIds.stream().anyMatch(value -> !value.matches("[a-zA-Z0-9-]{1,100}"))) {
            throw new IllegalArgumentException("节点资源绑定 ID 无效");
        }
        tools = tools == null ? null : List.copyOf(tools);
        mcpServers = mcpServers == null ? null : List.copyOf(mcpServers);
    }
}
