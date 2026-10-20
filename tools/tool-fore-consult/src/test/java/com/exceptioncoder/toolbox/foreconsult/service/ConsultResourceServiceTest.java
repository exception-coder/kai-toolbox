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
        assertThrows(IllegalArgumentException.class, () -> service.query("runtime", "denied", "select 1"));
        verify(gateway, times(1)).query(anyString(), anyList(), anyString(), anyString());
        verify(workflows, never()).production();
        assertThrows(IllegalArgumentException.class, () -> service.query("unknown", "selected", "select 1"));
    }
    @Test void sourceRoutingHttpSignsEveryReadAndSerializesLegacyNull() throws Exception {
        var access = new ConsultResourceAccess();
        var routing = mock(ConsultSourceRoutingService.class);
        var controller = new com.exceptioncoder.toolbox.foreconsult.api.ConsultResourceController(
                mock(ConsultResourceService.class), access);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "routing", routing);
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(controller).build();
        String url = "/api/fore-consult/resources/sessions/runtime/source-routing";
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
        verifyNoInteractions(routing);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url)
                        .header("X-Consult-Resource-Token", access.issue("runtime")))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().string("null"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url)
                        .param("project", "api").param("path", "src/Order.java")
                        .header("X-Consult-Resource-Token", access.issue("runtime")))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
        verify(routing).forRuntime("runtime", "api", "src/Order.java");
    }
    @Test void sourceSynchronizationRequiresRuntimeSignatureAndUsesOnlyProjectIdentity() throws Exception {
        var access = new ConsultResourceAccess();
        var sync = mock(ConsultSourceSyncService.class);
        var controller = new com.exceptioncoder.toolbox.foreconsult.api.ConsultResourceController(mock(ConsultResourceService.class), access);
        org.springframework.test.util.ReflectionTestUtils.setField(controller, "sourceSync", sync);
        when(sync.synchronize("runtime", "api")).thenReturn(new ConsultSourceSyncService.Result("UP_TO_DATE", "checked", "main", "a".repeat(40), 1));
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(controller).build();
        String url = "/api/fore-consult/resources/sessions/runtime/source-sync";
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(url)
                        .contentType("application/json").content("{\"project\":\"api\"}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
        verifyNoInteractions(sync);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(url)
                        .header("X-Consult-Resource-Token", access.issue("runtime"))
                        .contentType("application/json").content("{\"project\":\"api\"}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.status").value("UP_TO_DATE"));
        verify(sync).synchronize("runtime", "api");
    }

    @Test void automaticAnchorCannotBeUsedAsDatabaseIdentity() {
        var sessions = mock(ConsultSessionRepository.class);
        var workflows = mock(ConsultWorkflowRepository.class);
        var gateway = mock(ReadonlyResourceGateway.class);
        var scope = new com.exceptioncoder.toolbox.foreconsult.domain.ConsultSourceRouting(
                true, null, List.of(), null, null, null);
        when(sessions.findByDevSessionId("runtime")).thenReturn(Optional.of(ConsultSession.builder()
                .sessionId("consult").systemSourcePath("/anchor").evidenceRouteSnapshot(scope.wrap("[]")).build()));
        var service = new ConsultResourceService(sessions, workflows, gateway);
        var exception = assertThrows(IllegalArgumentException.class, () -> service.query("runtime", "selected", "select 1"));
        assertTrue(exception.getMessage().contains("尚未定位服务端"));
        verifyNoInteractions(gateway, workflows);
    }
    @Test void webResourcesUseFrozenNodeSelectionAndSignedHttpWithoutOpeningDatabaseCalls() throws Exception {
        var sessions = mock(ConsultSessionRepository.class);
        var workflows = mock(ConsultWorkflowRepository.class);
        var db = mock(ReadonlyResourceGateway.class);
        var web = mock(com.exceptioncoder.toolbox.common.resource.WebResourceGateway.class);
        when(sessions.findByDevSessionId("runtime")).thenReturn(Optional.of(ConsultSession.builder()
                .sessionId("consult").systemSourcePath("/system").build()));
        var workflow = new ConsultWorkflow(List.of(new ConsultWorkflowNode("web", "网页", true, "需要时", "登录读取", "只读", "环境证据",
                List.of("consult_web"), List.of("consult-readonly"), List.of("web-uat"))));
        when(workflows.session("consult")).thenReturn(Optional.of(new ConsultWorkflowRepository.Snapshot(4L, workflow)));
        var service = new ConsultResourceService(sessions, workflows, db);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "webResources", web);
        service.webResources("runtime");
        verify(web).discover("/system", List.of("web-uat"));
        var request = new com.exceptioncoder.toolbox.common.resource.WebResourceGateway.Request("web-uat", "/orders", "UAT", null);
        service.webPage("runtime", request);
        verify(web).read("runtime", "/system", List.of("web-uat"), request);
        verifyNoInteractions(db);
        var assembly = new ConsultToolAssemblyProvider(sessions, workflows,
                new com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultWorkflowService(List.of(), workflows))
                .resolve("runtime").orElseThrow();
        assertTrue(assembly.tools().contains("consult_web"));
        assertFalse(assembly.tools().contains("consult_resource_query"));
        assertTrue(assembly.instructions().contains("匹配用户URL或明确环境"));
        var access = new ConsultResourceAccess();
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(
                new com.exceptioncoder.toolbox.foreconsult.api.ConsultResourceController(service, access)).build();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/fore-consult/resources/sessions/runtime/web"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
    }

    private ConsultWorkflowNode node(String id, boolean enabled, String binding) {
        return new ConsultWorkflowNode(id, id, enabled, "开始", "查询", "只读", "证据",
                List.of("consult_resources", "consult_resource_query"), List.of("consult-readonly"), List.of(binding));
    }
}
