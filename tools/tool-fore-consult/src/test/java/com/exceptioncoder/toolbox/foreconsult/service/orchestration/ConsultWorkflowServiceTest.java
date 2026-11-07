package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.ConsultWorkflow;
import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.ConsultWorkflowNode;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultWorkflowRepository;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;

class ConsultWorkflowServiceTest {
    @Test
    void defaultsContainAutomaticDatabaseEvidenceAndRenderChangedRulesOnly() {
        var c = new ConsultEvidenceAdaptiveStepConfiguration();
        var service = new ConsultWorkflowService(List.of(c.consultV4SafetyAndEvidencePlanStep(),
                c.consultV4ModuleAndCoreSpecStep(), c.consultV4ImplementationEvidenceStep(),
                c.consultV4DdlAndRuntimeEvidenceStep(), c.consultV4EvidenceConflictGateStep(),
                c.consultV4AnswerContractStep()), mock(ConsultWorkflowRepository.class));
        var defaults = service.defaults();
        assertThat(defaults.nodes()).hasSize(6);
        assertThat(defaults.nodes()).allSatisfy(n -> assertThat(n.outputContract())
                .contains("平台表达Skill").doesNotContain("返回结论、证据来源、环境与未验证项"));
        assertThat(defaults.nodes().get(1).instructions())
                .contains("source=domain", "source_projects", "授权候选 ID 分别查询")
                .doesNotContain("source=topology", "source=all");
        assertThat(defaults.nodes().get(3).instructions()).contains("直接调用", "不要求用户代查", "最多修正重试两次");
        var changed = new ConsultWorkflow(List.of(node("custom", true, "仅核验采购订单", List.of("source_read")),
                node("disabled", false, "不可出现的规则", List.of("scm_db_query"))));
        var rendered = service.render(new ConsultOrchestrationRequest("为什么失败", "SCM", "D:/scm", List.of(), "IT", true),
                new ConsultWorkflowRepository.Snapshot(8L, changed));
        assertThat(rendered.prompt()).contains("仅核验采购订单", "平台安全边界", "consult-workflow-8",
                        "URL 是可选定位线索，不是开始探索的前置条件", "菜单知识未命中不等于无法定位",
                        "只有已探索可用证据仍无法区分候选页面", "不扩大系统、目录或数据源范围")
                .doesNotContain("不可出现的规则");
        assertThat(changed.tools()).containsExactly("source_read");
        assertThat(rendered.steps()).hasSize(1);
    }

    @Test
    void legacyWorkflowRendersCurrentKnowledgeRulesWithoutRewritingSnapshot() {
        var legacyInstructions = "先调用 domain-knowledge.resolve_consult_context，跨系统关系使用 source=topology。";
        var workflow = new ConsultWorkflow(List.of(node("legacy", true, legacyInstructions, List.of("knowledge_query"))));
        var service = new ConsultWorkflowService(List.of(), mock(ConsultWorkflowRepository.class));
        var rendered = service.render(new ConsultOrchestrationRequest("订单如何同步", "SCM", "D:/scm", List.of(), "IT", true),
                new ConsultWorkflowRepository.Snapshot(3L, workflow));

        assertThat(workflow.nodes().getFirst().instructions()).isEqualTo(legacyInstructions);
        assertThat(rendered.prompt()).contains("当前知识查询统一使用knowledge_query(source=domain)",
                "domain-knowledge、cross-topology及source=topology/all已退役",
                "旧流程节点的知识来源指令与本节冲突时，以本节为准",
                "索引指向其他目录的已有文档时，使用source_read按授权路径读取原文");
    }

    @Test
    void rejectsDuplicateIdsUnknownToolsMissingProvidersAndEmptyEnabledWorkflow() {
        var valid = node("check", true, "查询", List.of("source_read"));
        assertThatThrownBy(() -> new ConsultWorkflow(List.of(valid, valid))).hasMessageContaining("重复");
        assertThatThrownBy(() -> new ConsultWorkflow(List.of(node("unknown", true, "查询", List.of("write")))))
                .hasMessageContaining("未登记");
        assertThatThrownBy(() -> new ConsultWorkflow(List.of(new ConsultWorkflowNode("missing", "节点", true,
                "需要时", "查询", "只读", "结论", List.of("source_read"), List.of())))).hasMessageContaining("提供方");
        assertThatThrownBy(() -> new ConsultWorkflow(List.of(node("off", false, "查询", List.of()))))
                .hasMessageContaining("至少启用");
    }

    private ConsultWorkflowNode node(String id, boolean enabled, String rules, List<String> tools) {
        return new ConsultWorkflowNode(id, "核验", enabled, "需要时", rules, "只读", "证据", tools,
                List.of("consult-readonly"));
    }
}
