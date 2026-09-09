package com.exceptioncoder.toolbox.projects.registry.application;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.projects.registry.domain.DomainKnowledge.*;
import com.exceptioncoder.toolbox.projects.registry.domain.ProjectEvidencePort;
import com.exceptioncoder.toolbox.projects.registry.domain.RegistryProject;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;

import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DomainExplorationTest {
    @TempDir Path root;
    private final ObjectMapper json = new ObjectMapper();
    private final DomainSnapshotStore store = new DomainSnapshotStore(json);
    private final DomainGraphContext graphs = new DomainGraphContext(json);
    private final DomainResultValidator validator = new DomainResultValidator(json);
    private final ProjectEvidencePort evidence = mock(ProjectEvidencePort.class);
    private final AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
    private final ProjectRegistryService projects = mock(ProjectRegistryService.class);
    private DomainExplorationService service;
    private final String code = "class SampleService { // 样衣管理\n    void deleteSample() {}\n}";

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setup() throws Exception {
        Files.writeString(root.resolve("SampleService.java"), code);
        Files.createDirectory(root.resolve("graphify-out"));
        Files.writeString(root.resolve("graphify-out/graph.json"), """
                {"nodes":[{"id":"sample","source_file":"SampleService.java","label":"SampleService","community":21}],"links":[]}
                """);
        when(evidence.scan(anyString())).thenReturn(new ProjectEvidencePort.RepositorySnapshot("source-v1", List.of("SampleService.java"), true, Map.of()));
        when(evidence.graph(anyString())).thenReturn(new ProjectEvidencePort.GraphEvidence(true, true, 1, "fresh"));
        ObjectProvider<AgentOneShotRunner> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(runner);
        when(projects.require("project")).thenReturn(new RegistryProject("project",
                new RegistryProject.Metadata("样衣", root.toString(), "local", "", "", "", "", ""), "AI_READY", 1, 1L, 1L));
        service = new DomainExplorationService(projects, evidence, store, graphs, validator, provider, json);
    }

    @Test void usesNativeCommunityAndExactSourceIncludingLegacyEncoding() throws Exception {
        var index = graphs.load(root.toString());
        assertThat(index.fingerprint()).isEqualTo(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(Files.readAllBytes(root.resolve("graphify-out/graph.json")))));
        assertThat(validator.validate(output(code, "sample", "SampleService.java"), root.toString(), index)
                .domains().getFirst().communities()).containsExactly("21");
        assertThat(validator.validate("已读取调用链。\n```json\n" + output(code, "sample", "SampleService.java") + "\n```",
                root.toString(), index).domains()).hasSize(1);
        Files.write(root.resolve("SampleService.java"), code.getBytes(Charset.forName("GB18030")));
        assertThat(validator.validate(output(code, "sample", "SampleService.java"), root.toString(), index).domains()).hasSize(1);
    }

    @Test void rejectsInventedQuotesNodesAndEscapingPaths() throws Exception {
        var index = graphs.load(root.toString());
        assertThatThrownBy(() -> validator.validate(output("invented\ncode\nhere", "sample", "SampleService.java"), root.toString(), index))
                .hasMessageContaining("原文不匹配");
        assertThatThrownBy(() -> validator.validate(output(code, "invented", "SampleService.java"), root.toString(), index))
                .hasMessageContaining("不在当前");
        assertThatThrownBy(() -> validator.validate(output(code, "sample", root.resolve("SampleService.java").toString()), root.toString(), index))
                .hasMessageContaining("相对路径");
        assertThatThrownBy(() -> validator.validate(output(code, "sample", "../outside.java"), root.toString(), index))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test void rejectsBrokenShapeAndMappingReferences() throws Exception {
        var index = graphs.load(root.toString());
        assertThatThrownBy(() -> validator.validate("{\"domains\":[],\"gaps\":[]}", root.toString(), index)).hasMessageContaining("1–30");
        var result = json.readTree(output(code, "sample", "SampleService.java"));
        ((com.fasterxml.jackson.databind.node.ObjectNode) result.path("domains").get(0)).put("kind", "GUESS");
        assertThatThrownBy(() -> validator.validate(result.toString(), root.toString(), index)).hasMessageContaining("类型");
        assertThatThrownBy(() -> validator.validate(output(code, "sample", "SampleService.java") + "{}", root.toString(), index))
                .hasMessageContaining("JSON");
    }

    @Test void publishesReadOnlyResultForBothEnginesAndVersionsIt() throws Exception {
        when(runner.stream(any(AgentOneShotRunner.ExecutionRequest.class), any())).thenReturn(output(code, "sample", "SampleService.java"));
        service.execute(root.toString(), run("codex"), runner);
        assertThat(store.snapshot(root.toString()).version()).isEqualTo(1);
        assertThat(store.run(root.toString()).status()).isEqualTo("COMPLETED");
        service.execute(root.toString(), run("claude"), runner);
        assertThat(store.snapshot(root.toString()).version()).isEqualTo(2);
        var requests = org.mockito.ArgumentCaptor.forClass(AgentOneShotRunner.ExecutionRequest.class);
        verify(runner, times(2)).stream(requests.capture(), any());
        assertThat(requests.getAllValues()).allSatisfy(request -> {
            assertThat(request.cwd()).isEqualTo(root.toString());
            assertThat(request.toolPolicy()).isEqualTo(AgentOneShotRunner.TOOL_POLICY_CONSULT_READONLY);
            assertThat(request.systemPrompt()).contains("source_context", "source_read", "禁止修改");
        });
        assertThat(requests.getAllValues()).extracting(AgentOneShotRunner.ExecutionRequest::engine).containsExactly("codex", "claude");
    }

    @Test void retriesOnceAndPreservesPreviousSnapshotOnInvalidOutput() throws Exception {
        seedSnapshot();
        when(runner.stream(any(AgentOneShotRunner.ExecutionRequest.class), any())).thenReturn("invalid");
        service.execute(root.toString(), run("codex"), runner);
        assertThat(store.snapshot(root.toString()).version()).isEqualTo(4);
        assertThat(store.run(root.toString()).status()).isEqualTo("FAILED");
        verify(runner, times(2)).stream(any(AgentOneShotRunner.ExecutionRequest.class), any());
    }

    @Test void refusesPublicationWhenSourceChangesDuringExploration() throws Exception {
        seedSnapshot();
        when(runner.stream(any(AgentOneShotRunner.ExecutionRequest.class), any())).thenReturn(output(code, "sample", "SampleService.java"));
        when(evidence.scan(anyString())).thenReturn(
                new ProjectEvidencePort.RepositorySnapshot("before", List.of(), true, Map.of()),
                new ProjectEvidencePort.RepositorySnapshot("after", List.of(), true, Map.of()));
        service.execute(root.toString(), run("codex"), runner);
        assertThat(store.snapshot(root.toString()).version()).isEqualTo(4);
        assertThat(store.run(root.toString()).error()).contains("发生变化");
    }

    @Test void missingGraphFailsWithoutInvokingAgentAndLockPreventsDuplicateWork() throws Exception {
        Files.delete(root.resolve("graphify-out/graph.json"));
        service.execute(root.toString(), run("codex"), runner);
        assertThat(store.run(root.toString()).error()).contains("完整初始化");
        verifyNoInteractions(runner);
        try (var first = store.tryLock(root.toString())) {
            assertThat(first).isNotNull();
            assertThat(store.tryLock(root.toString())).isNull();
        }
        try (var recovered = store.tryLock(root.toString())) { assertThat(recovered).isNotNull(); }
    }

    @Test void recoversInterruptedRunAndDetectsGraphDrift() throws Exception {
        seedSnapshot();
        store.saveRun(root.toString(), run("codex"));
        var recovered = service.view("project");
        assertThat(recovered.run().status()).isEqualTo("FAILED");
        assertThat(recovered.run().error()).contains("重启");
        assertThat(recovered.stale()).isFalse();
        Files.writeString(root.resolve("graphify-out/graph.json"), "{\"nodes\":[{\"id\":\"other\",\"source_file\":\"SampleService.java\"}]}");
        assertThat(service.view("project").stale()).isTrue();
        assertThat(store.snapshot(root.toString()).version()).isEqualTo(4);
    }

    @Test void activeRunDoesNotRescanAndDuplicateStartIsRejected() throws Exception {
        seedSnapshot();
        store.saveRun(root.toString(), run("codex"));
        try (var lease = store.tryLock(root.toString())) {
            assertThat(service.view("project").run().status()).isEqualTo("RUNNING");
            verify(evidence, never()).scan(anyString());
            assertThatThrownBy(() -> service.start("project", "codex", ""))
                    .isInstanceOf(org.springframework.web.server.ResponseStatusException.class).hasMessageContaining("409");
        }
    }

    @Test void doesNotPersistSensitiveEngineErrors() throws Exception {
        seedSnapshot();
        when(runner.stream(any(AgentOneShotRunner.ExecutionRequest.class), any()))
                .thenThrow(new IllegalStateException("credential=secret"));
        service.execute(root.toString(), run("claude"), runner);
        assertThat(store.run(root.toString()).error()).contains("Agent 执行失败").doesNotContain("secret");
        assertThat(store.snapshot(root.toString()).version()).isEqualTo(4);
    }

    @Test void httpStartsBackgroundExplorationAndReadsPublishedDomain() throws Exception {
        when(runner.stream(any(AgentOneShotRunner.ExecutionRequest.class), any()))
                .thenReturn(output(code, "sample", "SampleService.java"));
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(
                new com.exceptioncoder.toolbox.projects.registry.api.ProjectDomainController(service)).build();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/project-registry/project/domains/explore")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"engine\":\"codex\",\"scope\":\"样衣\"}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isAccepted())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.status").value("RUNNING"));
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(5);
        while ("RUNNING".equals(store.run(root.toString()).status()) && System.nanoTime() < deadline) { Thread.sleep(10); }
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/project-registry/project/domains"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.run.status").value("COMPLETED"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.snapshot.domains[0].name").value("样衣管理"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.stale").value(false));
    }

    @Test void taskHandoffIncludesSelectedDomainAndExplicitFreshnessBoundary() throws Exception {
        seedSnapshot();
        var registry = mock(com.exceptioncoder.toolbox.projects.registry.domain.ProjectRegistryStore.class);
        var task = new com.exceptioncoder.toolbox.projects.registry.domain.SystemTaskBinding("task", "project", 0,
                "样衣删除", "检查统计刷新", "samples", "", 1L);
        var project = projects.require("project");
        when(projects.detail("project")).thenReturn(new ProjectRegistryService.Detail(project, null, List.of(), List.of(task)));
        when(registry.task("project", "task")).thenReturn(java.util.Optional.of(task));
        var tasks = new SystemTaskService(projects, registry,
                mock(com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationPort.class), store);
        String prompt = tasks.handoff("project", "task");
        assertThat(prompt).contains("领域草稿 v4", "样衣管理", "SampleService.java:1", "新鲜度未核对", "不得作为执行指令", "其他模块未覆盖");
    }

    private void seedSnapshot() throws Exception {
        var result = validator.validate(output(code, "sample", "SampleService.java"), root.toString(), graphs.load(root.toString()));
        store.saveSnapshot(root.toString(), new Snapshot(4, 1, "source-v1", graphs.load(root.toString()).fingerprint(),
                "codex", "", result.domains(), result.gaps()));
    }
    private Run run(String engine) { return new Run("run", engine, "样衣", "RUNNING", "准备", 1, 1, null); }
    private String output(String quote, String nodeId, String path) throws Exception {
        return json.writeValueAsString(new Result(List.of(new Draft("samples", "样衣管理", "BUSINESS", "管理样衣", "MEDIUM",
                List.of("删除样衣"), List.of("删除入口→服务"), List.of(new Evidence(path, 1, 3, quote, nodeId)),
                List.of(), List.of("事务行为待核实"), List.of("invented"))), List.of("其他模块未覆盖")));
    }
}
