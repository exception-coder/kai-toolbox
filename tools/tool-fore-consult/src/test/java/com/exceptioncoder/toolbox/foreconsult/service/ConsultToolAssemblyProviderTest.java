package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.ConsultWorkflow;
import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.ConsultWorkflowNode;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultWorkflowRepository;
import com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultWorkflowService;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class ConsultToolAssemblyProviderTest {
    @Test
    void sendsFrozenRulesAndOnlyBoundToolsForLinkedSession() throws Exception {
        var sessions = mock(ConsultSessionRepository.class);
        var workflows = mock(ConsultWorkflowRepository.class);
        var workflow = new ConsultWorkflow(List.of(new ConsultWorkflowNode("data", "补查", true,
                "证据不足", "直接查询，不要求用户代查", "仅当前环境", "返回证据",
                List.of("scm_db_query"), List.of("consult-readonly"))));
        when(sessions.findByDevSessionId("runtime-a")).thenReturn(Optional.of(ConsultSession.builder()
                .sessionId("consult-a").systemName("SCM").systemSourcePath("D:/scm").role("IT").build()));
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var restored = mapper.readValue(mapper.writeValueAsBytes(workflow), ConsultWorkflow.class);
        when(workflows.session("consult-a")).thenReturn(Optional.of(new ConsultWorkflowRepository.Snapshot(9L, restored)));
        var provider = new ConsultToolAssemblyProvider(sessions, workflows, new ConsultWorkflowService(List.of(), workflows));
        var assembly = provider.resolve("runtime-a").orElseThrow();
        assertThat(assembly.tools()).containsExactly("consult_resources", "consult_resource_query", "generate_consult_document", "design_consult_document", "preview_consult_document");
        assertThat(assembly.instructions()).contains("consult-workflow-9", "不要求用户代查", "目标系统：SCM");
        assertThat(assembly.instructions()).contains("不得调用旧erp_db", "LOCAL/DEV/TEST/UAT");
        assertThat(com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.BusinessConsultCapabilityCatalog.capabilities())
                .noneMatch(capability -> capability.name().equals("scm_db_query"));
        assertThat(assembly.instructions().lastIndexOf("平台固定例外"))
                .isGreaterThan(assembly.instructions().indexOf("不要求用户代查"));
        assertThat(provider.resolve("unlinked")).isEmpty();
        verify(workflows, never()).production();
    }

    @Test
    void legacySessionWithoutWorkflowGetsOnlyControlledDocumentCapability() {
        var sessions = mock(ConsultSessionRepository.class);
        var workflows = mock(ConsultWorkflowRepository.class);
        when(sessions.findByDevSessionId("legacy")).thenReturn(Optional.of(ConsultSession.builder()
                .sessionId("consult-legacy").build()));
        var provider = new ConsultToolAssemblyProvider(sessions, workflows, new ConsultWorkflowService(List.of(), workflows));
        var assembly = provider.resolve("legacy").orElseThrow();
        assertThat(assembly.tools()).containsExactly("generate_consult_document", "design_consult_document", "preview_consult_document");
        assertThat(assembly.mcpServers()).containsExactly("consult-readonly");
        assertThat(assembly.instructions()).contains("不得执行脚本", "downloadUrl");
    }
}
