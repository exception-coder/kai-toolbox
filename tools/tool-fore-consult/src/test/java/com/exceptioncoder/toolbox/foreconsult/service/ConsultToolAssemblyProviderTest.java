package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.resource.ReadonlyResourceGateway;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.ConsultWorkflow;
import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.ConsultWorkflowNode;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultWorkflowRepository;
import com.exceptioncoder.toolbox.foreconsult.service.orchestration.ConsultWorkflowService;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
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
        assertThat(assembly.tools()).containsExactly("consult_resources", "consult_resource_query", "generate_consult_document", "design_consult_document", "preview_consult_document", "read_consult_attachment", "read_consult_history", "consult_web", "browser_open_and_click");
        assertThat(assembly.instructions()).contains("consult-workflow-9", "不要求用户代查", "目标系统：SCM");
        assertThat(assembly.instructions()).contains("不得调用旧erp_db", "LOCAL/DEV/TEST/UAT");
        assertThat(assembly.instructions()).contains("实际使用查询结果作答时", "未查询数据库时不因存在可用绑定")
                .doesNotContain("结果必须说明实际资源和环境");
        assertThat(com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.BusinessConsultCapabilityCatalog.capabilities())
                .noneMatch(capability -> capability.name().equals("scm_db_query"));
        assertThat(assembly.instructions().lastIndexOf("平台固定例外"))
                .isGreaterThan(assembly.instructions().indexOf("不要求用户代查"));
        assertThat(provider.resolve("unlinked")).isEmpty();
        verify(workflows, never()).production();
    }

    @Test
    void sourceEnabledFrozenWorkflowGetsReadOnlyHistoryWithoutChangingSnapshot() {
        var sessions = mock(ConsultSessionRepository.class);
        var workflows = mock(ConsultWorkflowRepository.class);
        var workflow = new ConsultWorkflow(List.of(new ConsultWorkflowNode("source", "源码", true,
                "需要源码时", "核对源码", "只读", "证据",
                List.of("source_read"), List.of("consult-readonly", "domain-knowledge"))));
        when(sessions.findByDevSessionId("runtime-source")).thenReturn(Optional.of(ConsultSession.builder()
                .sessionId("consult-source").systemName("ERP").systemSourcePath("D:/erp").build()));
        when(workflows.session("consult-source")).thenReturn(
                Optional.of(new ConsultWorkflowRepository.Snapshot(1L, workflow)));
        var provider = new ConsultToolAssemblyProvider(sessions, workflows, new ConsultWorkflowService(List.of(), workflows));
        assertThat(provider.resolve("runtime-source").orElseThrow().tools())
                .contains("source_read", "source_git_history", "knowledge_query");
        assertThat(provider.resolve("runtime-source").orElseThrow().mcpServers()).doesNotContain("domain-knowledge", "cross-topology");
        assertThat(workflow.tools()).containsExactly("source_read");
        verify(workflows, never()).production();
    }

    @Test
    void legacySessionWithoutWorkflowGetsControlledDocumentAndWebCapabilities() {
        var sessions = mock(ConsultSessionRepository.class);
        var workflows = mock(ConsultWorkflowRepository.class);
        when(sessions.findByDevSessionId("legacy")).thenReturn(Optional.of(ConsultSession.builder()
                .sessionId("consult-legacy").build()));
        var provider = new ConsultToolAssemblyProvider(sessions, workflows, new ConsultWorkflowService(List.of(), workflows));
        var assembly = provider.resolve("legacy").orElseThrow();
        assertThat(assembly.tools()).containsExactly("generate_consult_document", "design_consult_document", "preview_consult_document", "read_consult_attachment", "read_consult_history", "consult_web", "browser_open_and_click");
        assertThat(assembly.mcpServers()).containsExactly("consult-readonly", "forge_browser");
        assertThat(assembly.instructions()).contains("平台基础能力", "只读 GET 接口", "不等于平台没有浏览器");
        assertThat(assembly.instructions()).contains("第一步调用 consult_web DISCOVER", "以该 bindingId 调用 READ",
                "已有匹配绑定的操作不得转用 cua_repl", "WAITING_LOGIN 或账号检查失败时停止");
        assertThat(assembly.instructions()).contains("不得执行脚本", "downloadUrl",
                "【平台表达Skill：consult-plain-writing】");
    }

    @Test
    void selectsTheBoundApplicationFromTheCurrentTurnAndItsRegisteredEndpoint() {
        var sessions = mock(ConsultSessionRepository.class);
        var workflows = mock(ConsultWorkflowRepository.class);
        var resources = mock(ConsultResourceService.class);
        when(sessions.findByDevSessionId("runtime")).thenReturn(Optional.of(ConsultSession.builder()
                .sessionId("consult").build()));
        var provider = new ConsultToolAssemblyProvider(sessions, workflows, new ConsultWorkflowService(List.of(), workflows));
        ReflectionTestUtils.setField(provider, "resources", resources);
        var account = new ReadonlyResourceGateway.Entry("personal-test", "erp", "ERP", "测试账号",
                "TEST", "", "AVAILABLE", null, "https://erp.example.test/app/", "APP");
        when(resources.webResources("runtime")).thenReturn(List.of(account));

        assertThat(provider.resolve("runtime", "菜单搜成本分析，再核对上期价格").orElseThrow().managedWebAccount()).isTrue();
        var explicitBound = provider.resolve("runtime", "打开 https://ERP.example.test:443/app/menu").orElseThrow();
        assertThat(explicitBound.managedWebAccount()).isTrue();
        assertThat(explicitBound.publicBrowserFollowUp()).isFalse();
        assertThat(provider.resolve("runtime", "打开 https://public.example.test/app/menu").orElseThrow().managedWebAccount()).isFalse();
        assertThat(provider.resolve("runtime", "打开 https://erp.example.test:8443/app/menu").orElseThrow().managedWebAccount()).isFalse();
        assertThat(provider.resolve("runtime", "打开 https://erp.example.test/application").orElseThrow().managedWebAccount()).isFalse();
        var publicFollowUp = provider.resolve("runtime", "点击菜单", "https://public.example.test/").orElseThrow();
        assertThat(publicFollowUp.managedWebAccount()).isTrue();
        assertThat(publicFollowUp.publicBrowserFollowUp()).isTrue();
        var boundFollowUp = provider.resolve("runtime", "点击菜单", "https://erp.example.test/app/menu").orElseThrow();
        assertThat(boundFollowUp.managedWebAccount()).isTrue();
        assertThat(boundFollowUp.publicBrowserFollowUp()).isFalse();

        when(resources.webResources("runtime")).thenReturn(List.of());
        assertThat(provider.resolve("runtime", "菜单搜成本分析").orElseThrow().managedWebAccount()).isFalse();
        when(resources.webResources("runtime")).thenThrow(new IllegalStateException("目录暂不可用"));
        var fallback = provider.resolve("runtime", "点击菜单", "https://public.example.test/").orElseThrow();
        assertThat(fallback.managedWebAccount()).isTrue();
        assertThat(fallback.publicBrowserFollowUp()).isFalse();
        assertThat(fallback.tools()).contains("consult_web");
    }
}
