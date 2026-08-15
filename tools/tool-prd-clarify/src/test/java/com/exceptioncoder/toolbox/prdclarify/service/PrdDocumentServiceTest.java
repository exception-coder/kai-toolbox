package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
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
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PrdDocumentServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void updateBacksUpCurrentPrdAndWritesGeneratedArtifact() throws Exception {
        Fixture fixture = fixture();
        Files.writeString(tempDir.resolve("session.md"), "old-content");
        Files.writeString(tempDir.resolve("session-v1.md"), "older-content");
        answerWithContent(fixture.runner(), "generated-prd");

        fixture.service().generate("session", "keep-compatible", true, true, mock(SseEmitter.class));

        verify(fixture.artifactService(), timeout(3000)).write(
                "session", PrdArtifactType.PRD, "generated-prd",
                PrdArtifactService.ArtifactMetadata.empty());
        assertThat(Files.readString(tempDir.resolve("session-v2.md"))).isEqualTo("old-content");
        verify(fixture.repo()).updateStatus("session", "GENERATING");
    }

    @Test
    void backgroundGenerationContinuesAfterClientDisconnect() throws Exception {
        Fixture fixture = fixture();
        answerWithContent(fixture.runner(), "generated-after-disconnect");
        SseEmitter emitter = mock(SseEmitter.class);
        doThrow(new IOException("disconnected"))
                .when(emitter).send(any(SseEmitter.SseEventBuilder.class));

        fixture.service().generate("session", null, false, true, emitter);

        verify(fixture.artifactService(), timeout(3000)).write(
                "session", PrdArtifactType.PRD, "generated-after-disconnect",
                PrdArtifactService.ArtifactMetadata.empty());
        verify(fixture.repo(), never()).updateError(eq("session"), anyString());
    }

    @Test
    void generationFailureUpdatesErrorWithoutWritingArtifact() throws Exception {
        Fixture fixture = fixture();
        doThrow(new IllegalStateException("model failed")).when(fixture.runner()).stream(
                anyString(), anyString(), eq("gpt-5"), eq("codex"),
                org.mockito.ArgumentMatchers.<Consumer<String>>any(), anyList());

        fixture.service().generate("session", null, false, true, mock(SseEmitter.class));

        verify(fixture.repo(), timeout(3000)).updateError("session", "model failed");
        verify(fixture.artifactService(), never()).write(
                anyString(), any(), anyString(), any());
    }

    @Test
    void saveBacksUpAndContentAccessValidatesSession() throws Exception {
        Fixture fixture = fixture();
        Files.writeString(tempDir.resolve("session.md"), "old-content");

        fixture.service().saveContent("session", "edited-content");

        assertThat(Files.readString(tempDir.resolve("session-v1.md"))).isEqualTo("old-content");
        verify(fixture.artifactService()).write(
                "session", PrdArtifactType.PRD, "edited-content",
                PrdArtifactService.ArtifactMetadata.empty());
        assertThat(fixture.service().pathFor("session")).isEqualTo(tempDir.resolve("session.md"));
        assertThat(fixture.service().readContent("session")).isEqualTo("old-content");

        when(fixture.repo().findById("missing")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> fixture.service().readContent("missing"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("会话不存在: missing");
    }

    @Test
    void clarifyFacadeDelegatesEveryPrdDocumentOperation() throws Exception {
        PrdDocumentService documentService = mock(PrdDocumentService.class);
        SseEmitter emitter = mock(SseEmitter.class);
        Path path = tempDir.resolve("session.md");
        when(documentService.pathFor("session")).thenReturn(path);
        when(documentService.readContent("session")).thenReturn("content");
        PrdClarifyService facade = new PrdClarifyService(
                mock(AgentOneShotRunner.class), mock(PrdSessionRepository.class), mock(PrdFileStore.class),
                new ObjectMapper(), mock(GraphifyQueryService.class), mock(DomainKnowledgeQueryService.class),
                mock(PrdImageInputResolver.class), mock(PrdEffortEstimationService.class),
                mock(PrdRequirementSplitService.class), mock(PrdProgressEvaluationService.class),
                mock(PrdDocRevisionService.class), mock(PrdDevDocumentService.class),
                mock(PrdDevDocumentClarificationService.class), documentService);

        facade.generate("session", "notes", true, emitter);
        facade.generate("session", "notes", true, true, emitter);
        assertThat(facade.getPrdFilePath("session")).isEqualTo(path);
        facade.saveContent("session", "edited");
        assertThat(facade.readContent("session")).isEqualTo("content");

        verify(documentService).generate("session", "notes", true, false, emitter);
        verify(documentService).generate("session", "notes", true, true, emitter);
        verify(documentService).pathFor("session");
        verify(documentService).saveContent("session", "edited");
        verify(documentService).readContent("session");
    }

    private Fixture fixture() throws IOException {
        PrdSessionRepository repo = mock(PrdSessionRepository.class);
        PrdArtifactService artifactService = mock(PrdArtifactService.class);
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdImageInputResolver imageInputResolver = mock(PrdImageInputResolver.class);
        PrdFileStore fileStore = new PrdFileStore(tempDir);
        fileStore.init();
        when(repo.findById("session")).thenReturn(Optional.of(session()));
        when(imageInputResolver.resolve(anyString())).thenReturn(List.of());
        PrdDocumentService service = new PrdDocumentService(
                repo, fileStore, artifactService, runner, new ObjectMapper(), imageInputResolver);
        return new Fixture(repo, artifactService, runner, service);
    }

    private static void answerWithContent(AgentOneShotRunner runner, String content) {
        doAnswer(invocation -> {
            Consumer<String> onDelta = invocation.getArgument(4);
            onDelta.accept(content);
            return content;
        }).when(runner).stream(
                anyString(), anyString(), eq("gpt-5"), eq("codex"),
                org.mockito.ArgumentMatchers.<Consumer<String>>any(), anyList());
    }

    private static PrdSession session() {
        return PrdSession.builder()
                .id("session")
                .title("订单需求")
                .rawInput("实现订单能力")
                .model("gpt-5")
                .engine("codex")
                .documentProfile("CLASSIC")
                .build();
    }

    private record Fixture(PrdSessionRepository repo,
                           PrdArtifactService artifactService,
                           AgentOneShotRunner runner,
                           PrdDocumentService service) {
    }
}
