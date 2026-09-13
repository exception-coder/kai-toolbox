package com.exceptioncoder.toolbox.projects.registry.application;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.projects.registry.domain.DomainKnowledge;
import com.exceptioncoder.toolbox.projects.registry.domain.ProjectEvidencePort;
import com.exceptioncoder.toolbox.projects.registry.domain.RegistryProject;
import com.exceptioncoder.toolbox.projects.registry.domain.TopologyKnowledge.*;
import com.exceptioncoder.toolbox.projects.registry.infrastructure.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TopologyExplorationServiceTest {
    @TempDir Path root;
    private final ObjectMapper json = new ObjectMapper();
    private final ProjectRegistryService projects = mock(ProjectRegistryService.class);
    private final ProjectEvidencePort evidence = mock(ProjectEvidencePort.class);
    private final AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
    private final TopologySnapshotStore store = new TopologySnapshotStore(json);
    private final DomainSnapshotStore domainStore = new DomainSnapshotStore(json);
    private final TopologyResultValidator validator = new TopologyResultValidator(json);
    private TopologyExplorationService service;
    private String anchor;

    @BeforeEach @SuppressWarnings("unchecked")
    void setup() throws Exception {
        for (String id : List.of("a", "b", "c", "d")) {
            Path project = Files.createDirectory(root.resolve(id));
            Files.writeString(project.resolve("Api.java"), "class Api {}");
            Files.createDirectory(project.resolve("graphify-out"));
            Files.writeString(project.resolve("graphify-out/graph.json"), """
                    {"nodes":[{"id":"api","source_file":"Api.java","label":"Api","community":1}],"links":[]}
                    """);
            when(projects.require(id)).thenReturn(project(id, project));
        }
        anchor = root.resolve("a").toRealPath().toString();
        when(evidence.scan(anyString())).thenReturn(source("v1"));
        when(evidence.graph(anyString())).thenReturn(new ProjectEvidencePort.GraphEvidence(true, true, 1, "fresh", true));
        ObjectProvider<AgentOneShotRunner> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(runner);
        var graphs = new DomainGraphContext(json);
        var domains = new DomainExplorationService(projects, evidence, domainStore, graphs,
                new DomainResultValidator(json), provider, json);
        service = new TopologyExplorationService(projects, evidence, graphs, domains, store, validator, provider, json);
        validRunner();
    }

    @AfterEach void close() { service.close(); }

    @Test void publishesRelationsFromSeparateReadonlyRootsWithoutReplacingDomains() throws Exception {
        domainStore.saveSnapshot(anchor, new DomainKnowledge.Snapshot(9, 1, "old", "old", "codex", "",
                findings().domains(), List.of()));
        execute();
        assertThat(store.run(anchor).status()).isEqualTo("COMPLETED");
        assertThat(store.snapshot(anchor).relations()).hasSize(1);
        assertThat(store.snapshot(anchor).participants()).extracting(Participant::projectId).containsExactly("a", "b");
        assertThat(domainStore.snapshot(anchor).version()).isEqualTo(9);
        assertThat(service.view("a").stale()).isFalse();
        var requests = org.mockito.ArgumentCaptor.forClass(AgentOneShotRunner.ExecutionRequest.class);
        verify(runner, times(3)).stream(requests.capture(), any());
        assertThat(requests.getAllValues()).extracting(AgentOneShotRunner.ExecutionRequest::toolPolicy)
                .containsExactly("consult-readonly", "consult-readonly", "disabled");
        assertThat(requests.getAllValues().subList(0, 2)).extracting(AgentOneShotRunner.ExecutionRequest::cwd)
                .containsExactly(anchor, root.resolve("b").toRealPath().toString());
    }

    @Test void rejectsInvalidSelectionsAndDuplicateCanonicalDirectories() {
        for (List<String> ids : List.of(List.of("a"), List.of("b", "c"), List.of("a", "a"),
                List.of("a", "b", "c", "d", "e"))) {
            assertThatThrownBy(() -> service.selection("a", ids)).isInstanceOf(IllegalArgumentException.class);
        }
        when(projects.require("b")).thenReturn(project("b", root.resolve("a")));
        assertThatThrownBy(() -> service.selection("a", List.of("a", "b"))).hasMessageContaining("相同目录");
        assertThatThrownBy(() -> service.start("a", "unknown", "", List.of("a", "b")))
                .hasMessageContaining("Codex");
    }

    @Test void retainsSnapshotWhenSynthesisFailsAndLimitsRetries() throws Exception {
        execute();
        clearInvocations(runner);
        when(runner.stream(any(AgentOneShotRunner.ExecutionRequest.class), any())).thenAnswer(call -> {
            var request = call.getArgument(0, AgentOneShotRunner.ExecutionRequest.class);
            return "disabled".equals(request.toolPolicy()) ? "{}" : json.writeValueAsString(findings());
        });
        execute();
        assertThat(store.snapshot(anchor).version()).isEqualTo(1);
        assertThat(store.run(anchor).status()).isEqualTo("FAILED");
        verify(runner, times(4)).stream(any(AgentOneShotRunner.ExecutionRequest.class), any());
    }

    @Test void refusesPublicationIfSourceChangesAndMarksOldEvidenceStale() throws Exception {
        execute();
        when(evidence.scan(anyString())).thenReturn(source("v1"), source("v1"), source("v2"));
        execute();
        assertThat(store.snapshot(anchor).version()).isEqualTo(1);
        assertThat(store.run(anchor).error()).contains("已变化");
        assertThat(service.view("a").stale()).isTrue();
    }

    @Test void graphAndRegisteredPathChangesInvalidateResults() throws Exception {
        execute();
        Files.writeString(root.resolve("b/graphify-out/graph.json"), "{\"nodes\":[],\"links\":[]}");
        assertThat(service.view("a").stale()).isTrue();
        when(projects.require("b")).thenReturn(project("b", root.resolve("c")));
        assertThat(service.view("a").stale()).isTrue();
    }

    @Test void rejectsForeignAndOneSidedReferences() throws Exception {
        execute();
        List<Participant> participants = store.snapshot(anchor).participants();
        String valid = json.writeValueAsString(result());
        assertThatThrownBy(() -> validator.validate(valid.replace("\"evidenceIndex\":0", "\"evidenceIndex\":99"), participants))
                .hasMessageContaining("越界");
        assertThatThrownBy(() -> validator.validate(valid.replace("\"projectId\":\"b\"", "\"projectId\":\"a\""), participants))
                .hasMessageContaining("两端");
        assertThatThrownBy(() -> validator.validate(valid.replace("\"toProjectId\":\"b\"", "\"toProjectId\":\"c\""), participants))
                .hasMessageContaining("两个选中");
        assertThatThrownBy(() -> validator.validate(valid + "{}", participants)).hasMessageContaining("JSON");
        assertThat(validator.validate("{\"relations\":[],\"gaps\":[\"未发现双端证据\"]}", participants).relations()).isEmpty();
    }

    @Test void handlesLockConflictAndInterruptedRunWithoutScanningActiveProjects() {
        var run = run();
        store.saveRun(anchor, run);
        try (var lease = store.tryLock(anchor)) {
            assertThat(lease).isNotNull();
            assertThatThrownBy(() -> service.start("a", "codex", "", List.of("a", "b")))
                    .isInstanceOf(ResponseStatusException.class).hasMessageContaining("409");
            assertThat(service.view("a").run().status()).isEqualTo("RUNNING");
            verify(evidence, never()).scan(anyString());
        }
        assertThat(service.view("a").run().status()).isEqualTo("FAILED");
    }

    @Test void rejectsInvalidSourceBeforeSynthesis() throws Exception {
        when(runner.stream(any(AgentOneShotRunner.ExecutionRequest.class), any()))
                .thenReturn(json.writeValueAsString(findings()).replace("class Api {}", "fabricated"));
        execute();
        assertThat(store.run(anchor).status()).isEqualTo("FAILED");
        assertThat(store.snapshot(anchor)).isNull();
        verify(runner, times(2)).stream(any(AgentOneShotRunner.ExecutionRequest.class), any());
    }

    private void execute() { service.execute(service.selection("a", List.of("a", "b")), run(), runner); }
    private void validRunner() {
        when(runner.stream(any(AgentOneShotRunner.ExecutionRequest.class), any())).thenAnswer(call -> {
            var request = call.getArgument(0, AgentOneShotRunner.ExecutionRequest.class);
            return json.writeValueAsString("disabled".equals(request.toolPolicy()) ? result() : findings());
        });
    }
    private DomainKnowledge.Result findings() {
        var citation = new DomainKnowledge.Evidence("Api.java", 1, 1, "class Api {}", "api");
        var draft = new DomainKnowledge.Draft("api", "接口", "TECHNICAL", "服务接口", "LOW", List.of("接口"),
                List.of(), List.of(citation), List.of(), List.of("运行待核实"), List.of("1"));
        return new DomainKnowledge.Result(List.of(draft), List.of("其它模块未覆盖"));
    }
    private Result result() {
        return new Result(List.of(new Relation("api-link", "a", "b", "API", "接口关系候选", "LOW",
                List.of(new Citation("a", "api", 0), new Citation("b", "api", 0)), List.of("调用待核实"))), List.of());
    }
    private DomainKnowledge.Run run() {
        return new DomainKnowledge.Run("run", "codex", "接口", "RUNNING", "开始", 1, 1, null);
    }
    private RegistryProject project(String id, Path path) {
        return new RegistryProject(id, new RegistryProject.Metadata(id, path.toString(), "local", "", "", "", "", ""),
                "AI_READY", 1, 1L, 1L);
    }
    private ProjectEvidencePort.RepositorySnapshot source(String fingerprint) {
        return new ProjectEvidencePort.RepositorySnapshot(fingerprint, List.of("Api.java"), true, Map.of());
    }
}
