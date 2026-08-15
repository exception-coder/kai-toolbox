package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.api.dto.DevDocVersionSummary;
import com.exceptioncoder.toolbox.prdclarify.api.dto.QaPairRequest;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PrdDevDocumentServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void generatePersistsDraftArtifactHistoryAndDoneState() throws Exception {
        Fixture fixture = fixture(session(null, null));
        Path devDocPath = tempDir.resolve("session-dev.md");
        when(fixture.fileStore.read("session")).thenReturn("prd-content");
        when(fixture.fileStore.canonicalPathFor("session", PrdArtifactType.DEV_DOC))
                .thenReturn(devDocPath);
        doAnswer(invocation -> {
            Consumer<String> onDelta = invocation.getArgument(4);
            onDelta.accept("generated-dev-doc");
            return "generated-dev-doc";
        }).when(fixture.runner).stream(
                anyString(), anyString(), eq("gpt-5"), eq("codex"),
                org.mockito.ArgumentMatchers.<Consumer<String>>any(), anyList());

        fixture.service.generate("session", "keep-compatible", false,
                List.of(new QaPairRequest("事务边界？", "沿用现状")), true, true, mock(SseEmitter.class));

        verify(fixture.artifactService, org.mockito.Mockito.timeout(3000)).write(
                "session", PrdArtifactType.DEV_DOC, "generated-dev-doc",
                PrdArtifactService.ArtifactMetadata.empty());
        verify(fixture.repo).updateDevDocQaDraft(eq("session"), anyString());
        verify(fixture.repo).updateDevDocHistory(eq("session"), anyString());
        verify(fixture.repo).updateDevDocWorkStatus("session", "DONE", null);
    }

    @Test
    void generateRejectsIncompleteClarificationBeforeChangingState() {
        Fixture fixture = fixture(session(null, null));

        assertThatThrownBy(() -> fixture.service.generate(
                "session", null, false, List.of(), false, false, mock(SseEmitter.class)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("请先完成 TDD 技术澄清，再生成开发文档");

        verify(fixture.repo, never()).updateDevDocWorkStatus(anyString(), anyString(), any());
    }

    @Test
    void versionsFollowActualBackupFilesAndUseHistoryAsMetadata() throws Exception {
        Path current = tempDir.resolve("session-dev.md");
        Files.writeString(current, "current");
        Files.writeString(tempDir.resolve("session-dev-v1.md"), "version-1");
        Files.writeString(tempDir.resolve("session-dev-v3.md"), "version-3");
        String history = """
                [{"version":1,"mode":"generate","extraInstructions":"first","generatedAt":100,
                  "qaHistory":[{"question":"q","answer":"a"}]},
                 {"version":3,"mode":"update","extraInstructions":"third","generatedAt":300}]
                """;
        Fixture fixture = fixture(session(current.toString(), history));

        List<DevDocVersionSummary> versions = fixture.service.listVersions("session");

        assertThat(versions).extracting(DevDocVersionSummary::version).containsExactly(4, 3, 1);
        assertThat(versions.get(0).isCurrent()).isTrue();
        assertThat(versions.get(2).qaHistory()).containsExactly(new QaPairRequest("q", "a"));
        assertThat(fixture.service.readVersionContent("session", 3)).isEqualTo("version-3");
        assertThat(fixture.service.readVersionContent("session", 2)).isEmpty();
        assertThat(fixture.service.readVersionContent("session", 4)).isEqualTo("current");
    }

    @Test
    void saveBacksUpCurrentContentBeforeWritingArtifact() throws Exception {
        Path current = tempDir.resolve("session-dev.md");
        Files.writeString(current, "old-content");
        Files.writeString(tempDir.resolve("session-dev-v1.md"), "older-content");
        Fixture fixture = fixture(session(current.toString(), null));

        fixture.service.saveContent("session", "edited-content");

        assertThat(Files.readString(tempDir.resolve("session-dev-v2.md"))).isEqualTo("old-content");
        verify(fixture.artifactService).write("session", PrdArtifactType.DEV_DOC, "edited-content",
                PrdArtifactService.ArtifactMetadata.empty());
    }

    @Test
    void clarifyFacadeDelegatesEveryDevDocumentOperation() throws Exception {
        PrdDevDocumentService devDocumentService = mock(PrdDevDocumentService.class);
        SseEmitter emitter = mock(SseEmitter.class);
        List<QaPairRequest> history = List.of(new QaPairRequest("q", "a"));
        List<DevDocVersionSummary> versions = List.of(
                new DevDocVersionSummary(1, true, "generate", "", 100L, history));
        when(devDocumentService.readContent("session")).thenReturn("current");
        when(devDocumentService.readVersionContent("session", 1)).thenReturn("version");
        when(devDocumentService.listVersions("session")).thenReturn(versions);
        PrdClarifyService facade = new PrdClarifyService(
                mock(AgentOneShotRunner.class), mock(PrdSessionRepository.class), mock(PrdFileStore.class),
                new ObjectMapper(), mock(GraphifyQueryService.class),
                mock(DomainKnowledgeQueryService.class), mock(PrdImageInputResolver.class),
                mock(PrdEffortEstimationService.class), mock(PrdRequirementSplitService.class),
                mock(PrdProgressEvaluationService.class), mock(PrdDocRevisionService.class),
                devDocumentService, mock(PrdDevDocumentClarificationService.class),
                mock(PrdDocumentService.class));

        facade.generateDevDoc("session", "notes", true, history, true, true, emitter);
        assertThat(facade.readDevDocContent("session")).isEqualTo("current");
        assertThat(facade.readDevDocVersionContent("session", 1)).isEqualTo("version");
        assertThat(facade.listDevDocVersions("session")).isSameAs(versions);
        facade.saveDevDocContent("session", "edited");

        verify(devDocumentService).generate("session", "notes", true, history, true, true, emitter);
        verify(devDocumentService).readContent("session");
        verify(devDocumentService).readVersionContent("session", 1);
        verify(devDocumentService).listVersions("session");
        verify(devDocumentService).saveContent("session", "edited");
    }

    private Fixture fixture(PrdSession session) {
        PrdSessionRepository repo = mock(PrdSessionRepository.class);
        PrdFileStore fileStore = mock(PrdFileStore.class);
        PrdArtifactService artifactService = mock(PrdArtifactService.class);
        GraphifyQueryService graphifyQuery = mock(GraphifyQueryService.class);
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdImageInputResolver imageInputResolver = mock(PrdImageInputResolver.class);
        when(repo.findById("session")).thenReturn(Optional.of(session));
        when(imageInputResolver.resolve(anyString())).thenReturn(List.of());
        return new Fixture(repo, fileStore, artifactService, runner,
                new PrdDevDocumentService(repo, fileStore, artifactService, new ObjectMapper(),
                        graphifyQuery, runner, imageInputResolver));
    }

    private static PrdSession session(String devDocPath, String devDocHistory) {
        return PrdSession.builder()
                .id("session")
                .title("订单需求")
                .project("kai-toolbox")
                .module("PRD")
                .model("gpt-5")
                .engine("codex")
                .documentProfile("CLASSIC")
                .devDocPath(devDocPath)
                .devDocHistory(devDocHistory)
                .devDocGeneratedAt(400L)
                .build();
    }

    private record Fixture(PrdSessionRepository repo,
                           PrdFileStore fileStore,
                           PrdArtifactService artifactService,
                           AgentOneShotRunner runner,
                           PrdDevDocumentService service) {
    }
}
