package com.exceptioncoder.toolbox.foreconsult.service.orchestration;

import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.ConsultWorkflow;
import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.ConsultWorkflowNode;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultWorkflowRepository;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import java.nio.charset.StandardCharsets;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** 验证实际装配与旧快照兼容；不把提示词断言当作模型回答质量评测。 */
class ConsultPlainWritingSkillTest {
    @Test void packagedSkillIsInjectedExactlyOnceForEveryLegacyVersionAndFollowUp() throws Exception {
        String packaged = new ClassPathResource("fore-consult-skills/consult-plain-writing/SKILL.md")
                .getContentAsString(StandardCharsets.UTF_8).strip();
        for (String version : List.of("v1", "v2", "v3", "v4")) {
            for (boolean followUp : List.of(false, true)) {
                var request = new ConsultOrchestrationRequest("请给业务员简单结论", "ERP", "/erp", List.of(), "IT", followUp);
                var result = new ConsultOrchestrationPipeline(List.of()).orchestrate(request, version);
                assertThat(result.prompt()).endsWith(packaged);
                assertThat(result.prompt().split("【平台表达Skill：consult-plain-writing】", -1)).hasSize(2);
                assertThat(result.prompt()).contains("回答对象：IT", "请给业务员简单结论");
                assertThat(result.steps()).isEmpty();
            }
        }
    }

    @Test void frozenWorkflowGetsCurrentPresentationWithoutChangingEvidenceToolsOrMachineContract() {
        String oldRules = "最终回答按固定六段组织；必须保留<<<CONSULT_RECOGNITION>>>识别块";
        var node = new ConsultWorkflowNode("answer", "旧回答", true, "需要时", oldRules,
                "仅当前UAT环境只读", "保留识别块", List.of("source_read"), List.of("consult-readonly"));
        var workflow = new ConsultWorkflow(List.of(node));
        var service = new ConsultWorkflowService(List.of(), mock(ConsultWorkflowRepository.class));
        var result = service.render(new ConsultOrchestrationRequest("哪个表取数", "ERP", "/erp", List.of(), "BIZ", true),
                new ConsultWorkflowRepository.Snapshot(12L, workflow));
        assertThat(result.prompt()).contains(oldRules, "仅当前UAT环境只读", "<<<CONSULT_RECOGNITION>>>");
        assertThat(result.prompt().indexOf("【平台表达Skill：consult-plain-writing】"))
                .isGreaterThan(result.prompt().indexOf(oldRules));
        assertThat(workflow.nodes().getFirst()).isEqualTo(node);
        assertThat(workflow.tools()).containsExactly("source_read");
        assertThat(result.workflowSnapshot().version()).isEqualTo(12L);
    }
}
