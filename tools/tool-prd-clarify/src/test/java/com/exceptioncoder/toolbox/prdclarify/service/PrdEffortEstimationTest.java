package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.LocalProjectResolver;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;

import java.nio.file.Path;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.when;

class PrdEffortEstimationTest {

    @TempDir
    Path tempDir;

    @Test
    void rootRequirementUsesLatestExplicitRevisionAndPersistsResultOnRoot() throws Exception {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdSessionRepository repo = mock(PrdSessionRepository.class);
        PrdFileStore fileStore = mock(PrdFileStore.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<LocalProjectResolver> resolver = mock(ObjectProvider.class);
        ObjectMapper mapper = new ObjectMapper();
        PrdSession root = PrdSession.builder().id("root").title("原需求").status("DONE").engine("codex").build();
        PrdSession revision = PrdSession.builder()
                .id("revision-v2").title("原需求（修订版 v2）").parentId("root")
                .rawInput("【后台自动修订 — 基于：原需求】").status("DONE").engine("codex")
                .devDocPath(tempDir.resolve("revision-v2-dev.md").toString()).build();

        when(repo.findById("root")).thenReturn(Optional.of(root));
        when(repo.findLatestRevision("root")).thenReturn(Optional.of(revision));
        when(repo.findById("revision-v2")).thenReturn(Optional.of(revision));
        when(fileStore.read("revision-v2")).thenReturn("最新 PRD v2");
        when(fileStore.pathFor("revision-v2")).thenReturn(tempDir.resolve("revision-v2.md"));
        when(resolver.getIfAvailable()).thenReturn(null);
        when(runner.runOnce(any(AgentOneShotRunner.ExecutionRequest.class))).thenReturn("""
                我会按只读边界使用搜索工具核对相关模块，不修改任何文件。
                {"tool":"grep","status":"done"}
                最终评估如下：
                ```json
                {"hoursMin":8,"hoursMax":12,"confidence":"MEDIUM","reasoning":"按最新版估算","breakdown":[]}
                ```
                """);

        PrdClarifyService service = new PrdClarifyService(
                runner, repo, fileStore, mock(PrdArtifactService.class),
                mock(PrdPromptCatalog.class), mock(PrdAiRunService.class), mapper,
                mock(GraphifyQueryService.class), mock(DomainKnowledgeQueryService.class),
                mock(PrdImageInputResolver.class), resolver);
        service.estimateDevDocEffort("root", null, "codex");

        var json = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(repo).updateDevDocEstimation(eq("root"), json.capture());
        JsonNode saved = mapper.readTree(json.getValue());
        assertThat(saved.path("sourceSessionId").asText()).isEqualTo("revision-v2");
        assertThat(saved.path("sourceTitle").asText()).contains("修订版 v2");
        assertThat(saved.path("prdFingerprint").asText()).isNotBlank();
    }

    @Test
    void backgroundEstimateReturnsImmediatelyAndPersistsRunningThenCompleted() throws Exception {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdSessionRepository repo = mock(PrdSessionRepository.class);
        PrdFileStore fileStore = mock(PrdFileStore.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<LocalProjectResolver> resolver = mock(ObjectProvider.class);
        PrdSession session = PrdSession.builder()
                .id("prd-async").title("异步需求").status("DONE").engine("codex").build();
        when(repo.findById("prd-async")).thenReturn(Optional.of(session));
        when(repo.findLatestRevision("prd-async")).thenReturn(Optional.empty());
        when(fileStore.read("prd-async")).thenReturn("PRD");
        when(fileStore.pathFor("prd-async")).thenReturn(tempDir.resolve("prd-async.md"));
        when(resolver.getIfAvailable()).thenReturn(null);
        CountDownLatch agentEntered = new CountDownLatch(1);
        CountDownLatch releaseAgent = new CountDownLatch(1);
        when(runner.runOnce(any(AgentOneShotRunner.ExecutionRequest.class))).thenAnswer(invocation -> {
            agentEntered.countDown();
            releaseAgent.await(5, TimeUnit.SECONDS);
            return "{\"hoursMin\":2,\"hoursMax\":4,\"confidence\":\"HIGH\",\"breakdown\":[]}";
        });
        PrdClarifyService service = new PrdClarifyService(
                runner, repo, fileStore, mock(PrdArtifactService.class),
                mock(PrdPromptCatalog.class), mock(PrdAiRunService.class), new ObjectMapper(),
                mock(GraphifyQueryService.class), mock(DomainKnowledgeQueryService.class),
                mock(PrdImageInputResolver.class), resolver);

        long before = System.nanoTime();
        service.startEstimateDevDocEffort("prd-async", null, "codex");
        long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - before);

        assertThat(elapsedMillis).isLessThan(500);
        verify(repo, timeout(1000)).updateDevDocEstimation(eq("prd-async"), contains("\"workStatus\":\"RUNNING\""));
        assertThat(agentEntered.await(1, TimeUnit.SECONDS)).isTrue();
        releaseAgent.countDown();
        verify(repo, timeout(2000)).updateDevDocEstimation(eq("prd-async"), contains("\"workStatus\":\"COMPLETED\""));
    }
}
