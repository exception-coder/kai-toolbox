package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.LocalProjectResolver;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PrdProgressEvaluationTest {

    private static final int ASYNC_TIMEOUT_SECONDS = 5;

    @TempDir
    Path tempDir;

    @Test
    void usesProjectScopedReadonlyAgentAndCarriesOriginalUrl() throws Exception {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdSessionRepository repo = mock(PrdSessionRepository.class);
        PrdFileStore fileStore = mock(PrdFileStore.class);
        PrdArtifactService artifactService = mock(PrdArtifactService.class);
        DomainKnowledgeQueryService domainKnowledge = mock(DomainKnowledgeQueryService.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<LocalProjectResolver> resolverProvider = mock(ObjectProvider.class);
        LocalProjectResolver resolver = mock(LocalProjectResolver.class);
        SseEmitter emitter = mock(SseEmitter.class);
        CountDownLatch progressSaved = new CountDownLatch(1);
        AtomicReference<AgentOneShotRunner.ExecutionRequest> capturedRequest = new AtomicReference<>();
        Path devDoc = tempDir.resolve("progress-dev.md");
        Files.writeString(devDoc, "TDD 任务清单");
        PrdSession session = session(devDoc);

        when(repo.findById("progress")).thenReturn(Optional.of(session));
        when(repo.findLatestRevision("progress")).thenReturn(Optional.empty());
        when(fileStore.read("progress")).thenReturn("PRD 验收标准");
        when(fileStore.pathFor("progress")).thenReturn(tempDir.resolve("progress.md"));
        when(fileStore.canonicalPathFor("progress", PrdArtifactType.PROGRESS))
                .thenReturn(tempDir.resolve("progress-progress.md"));
        when(resolverProvider.getIfAvailable()).thenReturn(resolver);
        when(resolver.resolve("yoooni")).thenReturn(Optional.of(
                new LocalProjectResolver.ProjectLocation("yoooni", "D:\\projects\\yoooni")));
        when(domainKnowledge.query(any(), any())).thenReturn(null);
        when(runner.stream(any(AgentOneShotRunner.ExecutionRequest.class), any())).thenAnswer(invocation -> {
            capturedRequest.set(invocation.getArgument(0));
            @SuppressWarnings("unchecked")
            Consumer<String> onDelta = invocation.getArgument(1);
            String report = """
                    # 迟期原因备注 开发进度评估
                    <!-- CODE_EVIDENCE_STATUS: VERIFIED -->
                    ## 已完成
                    - [x] 保存备注
                      - 证据：NewMdevelopAction.updateDelayReasonRemark / NewMdevelopAction.java
                    ## 部分完成
                    ## 未完成
                    ## 文档与代码差异
                    | 需求 | 文档要求 | 当前代码 | 状态 |
                    |---|---|---|---|
                    | 保存备注 | 可保存 | 已实现 | 已完成 |
                    """;
            onDelta.accept(report);
            return report;
        });
        doAnswer(invocation -> {
            progressSaved.countDown();
            return null;
        }).when(artifactService).write(
                eq("progress"), eq(PrdArtifactType.PROGRESS), any(), any());

        PrdClarifyService service = service(
                runner, repo, fileStore, artifactService, domainKnowledge, resolverProvider);
        service.evaluateProgress("progress", null, emitter);

        assertThat(progressSaved.await(ASYNC_TIMEOUT_SECONDS, TimeUnit.SECONDS)).isTrue();
        AgentOneShotRunner.ExecutionRequest request = capturedRequest.get();
        assertThat(request).isNotNull();
        assertThat(request.cwd()).isEqualTo("D:\\projects\\yoooni");
        assertThat(request.toolPolicy()).isEqualTo(AgentOneShotRunner.TOOL_POLICY_CONSULT_READONLY);
        assertThat(request.userPrompt()).contains("newMdevelop_developWorkbenches.action", "source_context");
        assertThat(request.userPrompt()).contains("【测试核查】", "单元、接口、安全、集成");
        verify(artifactService).write(
                eq("progress"), eq(PrdArtifactType.PROGRESS), any(), any());
    }

    @Test
    void missingProjectDirectoryStopsEvaluationWithoutWritingZeroReport() throws Exception {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdSessionRepository repo = mock(PrdSessionRepository.class);
        PrdFileStore fileStore = mock(PrdFileStore.class);
        PrdArtifactService artifactService = mock(PrdArtifactService.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<LocalProjectResolver> resolverProvider = mock(ObjectProvider.class);
        LocalProjectResolver resolver = mock(LocalProjectResolver.class);
        SseEmitter emitter = mock(SseEmitter.class);
        CountDownLatch emitterCompleted = new CountDownLatch(1);
        Path devDoc = tempDir.resolve("progress-dev.md");
        Files.writeString(devDoc, "TDD");
        PrdSession session = session(devDoc);

        when(repo.findById("progress")).thenReturn(Optional.of(session));
        when(repo.findLatestRevision("progress")).thenReturn(Optional.empty());
        when(fileStore.read("progress")).thenReturn("PRD");
        when(resolverProvider.getIfAvailable()).thenReturn(resolver);
        when(resolver.resolve("yoooni")).thenReturn(Optional.empty());
        doAnswer(invocation -> {
            emitterCompleted.countDown();
            return null;
        }).when(emitter).complete();

        service(runner, repo, fileStore, artifactService,
                mock(DomainKnowledgeQueryService.class), resolverProvider)
                .evaluateProgress("progress", null, emitter);

        assertThat(emitterCompleted.await(ASYNC_TIMEOUT_SECONDS, TimeUnit.SECONDS)).isTrue();
        verify(emitter).complete();
        verify(runner, never()).stream(any(AgentOneShotRunner.ExecutionRequest.class), any());
        verify(artifactService, never()).write(any(), any(), any(), any());
    }

    private PrdSession session(Path devDoc) {
        return PrdSession.builder()
                .id("progress")
                .title("迟期原因备注")
                .rawInput("http://localhost/develop/newMdevelop_developWorkbenches.action?eventid=704061")
                .project("yoooni")
                .module("产品研发")
                .model("gpt-5")
                .engine("codex")
                .status("DONE")
                .devDocPath(devDoc.toString())
                .build();
    }

    private PrdClarifyService service(
            AgentOneShotRunner runner,
            PrdSessionRepository repo,
            PrdFileStore fileStore,
            PrdArtifactService artifactService,
            DomainKnowledgeQueryService domainKnowledge,
            ObjectProvider<LocalProjectResolver> resolverProvider) {
        return new PrdClarifyService(
                runner,
                repo,
                fileStore,
                artifactService,
                new ObjectMapper(),
                mock(GraphifyQueryService.class),
                domainKnowledge,
                mock(PrdImageInputResolver.class),
                resolverProvider);
    }
}
