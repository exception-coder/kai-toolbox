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
    void sendsFrozenRulesAndOnlyBoundToolsForLinkedSession() {
        var sessions = mock(ConsultSessionRepository.class);
        var workflows = mock(ConsultWorkflowRepository.class);
        var workflow = new ConsultWorkflow(List.of(new ConsultWorkflowNode("data", "补查", true,
                "证据不足", "直接查询，不要求用户代查", "仅当前环境", "返回证据",
                List.of("scm_db_query"), List.of("consult-readonly"))));
        when(sessions.findByDevSessionId("runtime-a")).thenReturn(Optional.of(ConsultSession.builder()
                .sessionId("consult-a").systemName("SCM").systemSourcePath("D:/scm").role("IT").build()));
        when(workflows.session("consult-a")).thenReturn(Optional.of(new ConsultWorkflowRepository.Snapshot(9L, workflow)));
        var provider = new ConsultToolAssemblyProvider(sessions, workflows, new ConsultWorkflowService(List.of(), workflows));
        var assembly = provider.resolve("runtime-a").orElseThrow();
        assertThat(assembly.tools()).containsExactly("scm_db_query");
        assertThat(assembly.instructions()).contains("consult-workflow-9", "不要求用户代查", "目标系统：SCM");
        assertThat(provider.resolve("unlinked")).isEmpty();
        verify(workflows, never()).production();
    }
}
