package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 版本化流程及其确定性配置校验；节点规则不能扩大平台权限。 */
public record ConsultWorkflow(List<ConsultWorkflowNode> nodes) {
    public ConsultWorkflow {
        if (nodes == null || nodes.isEmpty() || nodes.size() > 20) {
            throw new IllegalArgumentException("流程必须包含 1 至 20 个节点");
        }
        nodes = List.copyOf(nodes);
        Set<String> ids = new HashSet<>();
        for (ConsultWorkflowNode node : nodes) {
            validateNode(node);
            if (!ids.add(node.id())) {
                throw new IllegalArgumentException("节点 ID 重复：" + node.id());
            }
        }
        if (nodes.stream().noneMatch(ConsultWorkflowNode::enabled)) {
            throw new IllegalArgumentException("至少启用一个流程节点");
        }
    }

    public List<String> tools() {
        return nodes.stream().filter(ConsultWorkflowNode::enabled).flatMap(n -> n.tools().stream()).distinct().toList();
    }

    public List<String> mcpServers() {
        return nodes.stream().filter(ConsultWorkflowNode::enabled)
                .flatMap(n -> n.mcpServers().stream()).distinct().toList();
    }

    private static void validateNode(ConsultWorkflowNode node) {
        if (node == null || node.id() == null || !node.id().matches("[a-z][a-z0-9-]{0,79}")) {
            throw new IllegalArgumentException("节点 ID 必须为小写字母开头的字母、数字或连字符，最多 80 字符");
        }
        requireText(node.name(), "节点名称", 100);
        requireText(node.condition(), "触发条件", 2000);
        requireText(node.instructions(), "执行规则", 16000);
        requireText(node.queryConstraints(), "查询约束", 8000);
        requireText(node.outputContract(), "输出要求", 4000);
        if (node.tools() == null || node.mcpServers() == null
                || node.tools().size() > 30 || node.mcpServers().size() > 10) {
            throw new IllegalArgumentException("节点能力清单无效");
        }
        var registry = BusinessConsultCapabilityCatalog.byId();
        for (String server : node.mcpServers()) {
            if (!registry.containsKey("mcp:" + server)) {
                throw new IllegalArgumentException("未登记的 MCP：" + server);
            }
        }
        for (String tool : node.tools()) {
            var capability = registry.get("tool:" + tool);
            if (capability == null || !"READ_ONLY".equals(capability.permission())) {
                throw new IllegalArgumentException("未登记的只读 Tool：" + tool);
            }
            if (!node.mcpServers().contains(capability.source())) {
                throw new IllegalArgumentException("节点 Tool 缺少提供方 MCP：" + tool + " → " + capability.source());
            }
        }
    }

    private static void requireText(String text, String field, int max) {
        if (text == null || text.isBlank() || text.length() > max) {
            throw new IllegalArgumentException(field + "不能为空且最多 " + max + " 字符");
        }
    }
}
