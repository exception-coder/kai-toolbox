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
        assertThat(defaults.nodes().get(3).instructions()).contains("直接调用", "不要求用户代查", "最多修正重试两次");
        var changed = new ConsultWorkflow(List.of(node("custom", true, "仅核验采购订单", List.of("source_read")),
                node("disabled", false, "不可出现的规则", List.of("scm_db_query"))));
        var rendered = service.render(new ConsultOrchestrationRequest("为什么失败", "SCM", "D:/scm", List.of(), "IT", true),
                new ConsultWorkflowRepository.Snapshot(8L, changed));
        assertThat(rendered.prompt()).contains("仅核验采购订单", "平台安全边界", "consult-workflow-8")
                .doesNotContain("不可出现的规则");
        assertThat(changed.tools()).containsExactly("source_read");
        assertThat(rendered.steps()).hasSize(1);
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
