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
            + "需要实际数据库证据但无可用绑定时不能回退旧连接或其他环境，结论须保留无法核实的边界；"
            + "资源配置步骤只在管理员明确询问配置时提供，不自动交给业务人员。"
            + "仅LOCAL/DEV/TEST/UAT可查询；实际使用查询结果作答时说明其真实资源和环境，不能当作生产事实。"
            + "未查询数据库时不因存在可用绑定而在业务正文列出数据库和环境；正文按平台表达Skill，不固定附核查尾注。"
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
