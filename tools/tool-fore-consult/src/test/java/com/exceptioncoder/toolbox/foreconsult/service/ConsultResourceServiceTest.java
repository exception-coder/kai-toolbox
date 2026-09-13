package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.resource.ReadonlyResourceGateway;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.*;
import com.exceptioncoder.toolbox.foreconsult.repository.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultResourceServiceTest {
    @Test void resourceSignatureCannotBeReusedAcrossSessionsOrRestarts() {
        var access = new ConsultResourceAccess();
        assertDoesNotThrow(() -> access.require("one", access.issue("one")));
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> access.require("two", access.issue("one")));
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> access.require("one", null));
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> new ConsultResourceAccess().require("one", access.issue("one")));
    }
    @Test void runtimeHttpRequiresSignatureAndOnlyDispatchesQuery() throws Exception {
        var service = mock(ConsultResourceService.class);
        var access = new ConsultResourceAccess();
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(
                new com.exceptioncoder.toolbox.foreconsult.api.ConsultResourceController(service, access)).build();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/fore-consult/resources/sessions/runtime"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/fore-consult/resources/sessions/runtime/query")
                .header("X-Consult-Resource-Token", access.issue("runtime")).contentType("application/json")
                .content("{\"bindingId\":\"binding\",\"sql\":\"select 1\"}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
        verify(service).query("runtime", "binding", "select 1");
        verify(service, never()).discover(anyString());
    }
    @Test void readsOnlyFrozenEnabledNodeBindings() {
        var sessions = mock(ConsultSessionRepository.class);
        var workflows = mock(ConsultWorkflowRepository.class);
        var gateway = mock(ReadonlyResourceGateway.class);
        when(sessions.findByDevSessionId("runtime")).thenReturn(Optional.of(ConsultSession.builder()
                .sessionId("consult").systemSourcePath("/system").build()));
        var workflow = new ConsultWorkflow(List.of(node("on", true, "selected"), node("off", false, "denied")));
        when(workflows.session("consult")).thenReturn(Optional.of(new ConsultWorkflowRepository.Snapshot(4L, workflow)));
        var service = new ConsultResourceService(sessions, workflows, gateway);
        service.query("runtime", "selected", "select 1");
        verify(gateway).query("/system", List.of("selected"), "selected", "select 1");
        verify(workflows, never()).production();
        assertThrows(IllegalArgumentException.class, () -> service.query("unknown", "selected", "select 1"));
    }
    private ConsultWorkflowNode node(String id, boolean enabled, String binding) {
        return new ConsultWorkflowNode(id, id, enabled, "开始", "查询", "只读", "证据",
                List.of("consult_resources", "consult_resource_query"), List.of("consult-readonly"), List.of(binding));
    }
}
