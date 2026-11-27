package com.exceptioncoder.toolbox.foreconsult.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.exceptioncoder.toolbox.common.project.ProjectCatalog;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ConsultScreenshotEvidenceTest {
    @TempDir Path project;
    private final ObjectMapper mapper = new ObjectMapper();
    private final AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
    private static final List<AgentOneShotRunner.ImageInput> IMAGE_STUB =
            List.of(new AgentOneShotRunner.ImageInput("example", "image/png"));
    private static final List<String> SCOPE = List.of("erp");

    @Test
    void visibleSelectionSkipsBothCodeSearchAndImagePrepass() throws Exception {
        var search = mock(ConsultScreenshotSourceSearch.class);
        var locator = new ConsultScreenshotEvidence(search, mapper, List.of());
        var input = input("图里选的是哪种出货方式？", Map.of("pageTitle", "染整生产单"));

        assertThat(locator.locate("test", input, SCOPE, IMAGE_STUB, runner, "stub", "stub")).isEmpty();
        verifyNoInteractions(search, runner);
    }

    @Test
    void knownChineseLabelsFindLegacyRuleWithoutCallingAnotherModel() throws Exception {
        Path path = Files.createDirectories(project.resolve("WebRoot")).resolve("Shipment.jsp");
        Files.writeString(path, """
                <h2>染整生产单</h2>
                <label>净重出货</label>
                const restricted = orderStatus === "CLOSED";
                """, Charset.forName("GBK"));
        var locator = new ConsultScreenshotEvidence(search(), mapper, List.of());
        var input = input("为什么不能切换「净重出货」？", Map.of("pageTitle", "染整生产单"));

        assertThat(locator.locate("test", input, SCOPE, IMAGE_STUB, runner, "stub", "stub"))
                .singleElement().satisfies(packet -> {
                    assertThat(packet.text()).contains("净重出货", "orderStatus");
                    assertThat(packet.source()).isEqualTo("WebRoot/Shipment.jsp");
                });
        verifyNoInteractions(runner);
    }

    @Test
    void separatedLabelsDoNotOverrideARelevantLocalRule() throws Exception {
        Path web = Files.createDirectories(project.resolve("WebRoot"));
        Files.writeString(web.resolve("Overview.jsp"), "染整生产单" + " ".repeat(2000) + "净重出货");
        Files.writeString(web.resolve("Shipment.jsp"), "染整生产单和净重出货。实际出货权限规则");
        var evidence = search().find(SCOPE, List.of("染整生产单", "净重出货"), 2);
        assertThat(evidence).singleElement().satisfies(packet ->
                assertThat(packet.text()).contains("实际出货权限规则"));
    }

    @Test
    void visualLabelCombinesWithCallerPageTitleWithoutOptionalMessageTitle() throws Exception {
        Path web = Files.createDirectories(project.resolve("WebRoot"));
        Files.writeString(web.resolve("Shipment.jsp"), "染整生产单和净重出货。实际出货权限规则");
        var locator = new ConsultScreenshotEvidence(search(), mapper, List.of());
        var raw = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.valueToTree(
                input("为什么无法操作？", Map.of("pageTitle", "染整生产单", "controlLabel", "出货确认")));
        raw.remove("title");
        raw.put("externalUserId", "employee-123");
        var input = mapper.treeToValue(raw, ConsultAnalysisInput.class).validated();
        when(runner.runManaged(any(), anyString(), anyList())).thenReturn("[\"净重出货\"]");

        assertThat(locator.locate("test", input, SCOPE, IMAGE_STUB, runner, "stub", "stub"))
                .singleElement().satisfies(packet -> assertThat(packet.text()).contains("实际出货权限规则"));
    }

    private ConsultScreenshotSourceSearch search() {
        ProjectCatalog catalog = excluded -> List.of(new ProjectCatalog.Entry(
                "erp", "erp", "ERP", project.toString(), project.toString(), true, false, "registry"));
        return new ConsultScreenshotSourceSearch(catalog, ignored -> true);
    }

    private ConsultAnalysisInput input(String question, Map<String, String> context) throws Exception {
        var raw = mapper.valueToTree(Map.of("agentId", "it-support-partner", "tenantId", "tenant", "problemId", "IT-1",
                "conversationId", "consult-1", "requestId", "request-001", "title", "出货设置",
                "description", question, "businessContext", context));
        return mapper.treeToValue(raw, ConsultAnalysisInput.class).validated();
    }
}
