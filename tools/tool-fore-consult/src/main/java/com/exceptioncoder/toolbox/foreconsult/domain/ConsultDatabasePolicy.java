package com.exceptioncoder.toolbox.foreconsult.domain;

import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.ConsultWorkflow;
import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.ConsultWorkflowNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** 旧流程只能迁移查询意图，不能把旧独立连接迁移成资源授权。 */
public final class ConsultDatabasePolicy {
    private static final Set<String> LEGACY_TOOLS = Set.of("erp_db_query", "srm_db_query", "scm_db_query");
    private static final Set<String> LEGACY_SERVERS = Set.of("erp_db", "srm_db", "scm_db", "erp_app", "srm_app");
    public static final String INSTRUCTIONS = "数据库只能通过consult_resources发现本咨询选择的资源绑定，"
            + "再通过consult_resource_query只读查询；不得调用旧erp_db/srm_db/scm_db或其query工具。"
            + "无可用绑定时明确说明尚未配置咨询数据库，请管理员在项目库登记系统、系统资源中绑定测试数据库，"
            + "再到Agent管理的业务咨询流程节点选择资源并发布，不能回退旧连接或其他环境。"
            + "仅LOCAL/DEV/TEST/UAT可查询，结果必须说明实际资源和环境，不能当作生产事实。"
            + "旧咨询保留流程选择快照，资源停用或环境变为生产后立即不可查询。";

    private ConsultDatabasePolicy() { }

    public static ConsultWorkflow effective(ConsultWorkflow workflow) {
        return new ConsultWorkflow(workflow.nodes().stream().map(ConsultDatabasePolicy::effectiveNode).toList());
    }

    private static ConsultWorkflowNode effectiveNode(ConsultWorkflowNode node) {
        var tools = new ArrayList<>(node.tools().stream().filter(tool -> !LEGACY_TOOLS.contains(tool)).toList());
        boolean database = node.tools().stream().anyMatch(LEGACY_TOOLS::contains)
                || tools.contains("consult_resources") || tools.contains("consult_resource_query");
        var servers = new ArrayList<>(node.mcpServers().stream().filter(server -> !LEGACY_SERVERS.contains(server)).toList());
        if (database) {
            tools.addAll(List.of("consult_resources", "consult_resource_query"));
            servers.add("consult-readonly");
        }
        return new ConsultWorkflowNode(node.id(), node.name(), node.enabled(), node.condition(), node.instructions(),
                node.queryConstraints(), node.outputContract(), tools.stream().distinct().toList(),
                servers.stream().distinct().toList(), node.resourceBindingIds());
    }
}
