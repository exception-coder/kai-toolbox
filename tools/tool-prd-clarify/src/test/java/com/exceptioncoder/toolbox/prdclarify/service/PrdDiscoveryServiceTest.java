package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdDiscoveryRunRepository;
import com.exceptioncoder.toolbox.prdclarify.spi.InitialSpecPlanningGateway;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PrdDiscoveryServiceTest {

    @Test
    void shouldEnterGenerationDirectlyAfterInitialSpecConfirmation() throws Exception {
        PrdSessionRepository repository = mock(PrdSessionRepository.class);
        InitialSpecPlanningGateway planningGateway = mock(InitialSpecPlanningGateway.class);
        Path initialSpec = Files.createTempFile("initial-spec", ".md");
        Files.writeString(initialSpec, "# 初始化规格");
        PrdSession reviewSession = PrdSession.builder()
                .id("session-1")
                .title("订单取消")
                .status("SPEC_REVIEW")
                .initialSpecPath(initialSpec.toString())
                .build();
        PrdSession generatingSession = PrdSession.builder().id("session-1").status("GENERATING").build();
        when(repository.findById("session-1"))
                .thenReturn(Optional.of(reviewSession))
                .thenReturn(Optional.of(reviewSession))
                .thenReturn(Optional.of(generatingSession));
        PrdEvidenceOrchestrationService evidence = mock(PrdEvidenceOrchestrationService.class);
        when(evidence.discover(reviewSession)).thenReturn(new PrdEvidenceOrchestrationService.DiscoveryResult(
                "trace-1", "{\"version\":\"planning-evidence-trace-v2\"}", "", true, List.of()));
        PrdDiscoveryService service = new PrdDiscoveryService(
                repository,
                mock(PrdDiscoveryRunRepository.class),
                evidence,
                mock(AgentOneShotRunner.class),
                mock(PrdImageInputResolver.class),
                mock(PrdArtifactService.class),
                List.of(planningGateway),
                mock(org.springframework.beans.factory.ObjectProvider.class));

        PrdSession confirmed = service.confirm("session-1");

        verify(repository).updateStatus("session-1", "GENERATING");
        verify(planningGateway).schedule(org.mockito.ArgumentMatchers.argThat(request ->
                request.prdSessionId().equals("session-1")
                        && request.initialSpec().equals("# 初始化规格")));
        assertThat(confirmed.getStatus()).isEqualTo("GENERATING");
    }

    @Test
    void shouldUseModuleKnowledgeAndDdlEvidenceBeforeGeneratingInitialSpec() throws Exception {
        PrdSessionRepository repository = mock(PrdSessionRepository.class);
        PrdEvidenceOrchestrationService evidence = mock(PrdEvidenceOrchestrationService.class);
        PrdArtifactService artifacts = mock(PrdArtifactService.class);
        PrdImageInputResolver imageInputResolver = mock(PrdImageInputResolver.class);
        RecordingRunner runner = new RecordingRunner();
        PrdSession session = PrdSession.builder()
                .id("session-2")
                .title("订单取消")
                .project("erp")
                .module("订单模块")
                .rawInput("支持审核前取消")
                .engine("codex")
                .build();
        when(repository.findById("session-2")).thenReturn(Optional.of(session));
        when(evidence.discover(session)).thenReturn(new PrdEvidenceOrchestrationService.DiscoveryResult(
                "evidence-trace-1", "{\"version\":\"planning-evidence-trace-v2\"}",
                "## erp · CURRENT_IMPLEMENTATION · DOMAIN_KNOWLEDGE · HIT\n取消规则\n\n"
                        + "## erp · CURRENT_IMPLEMENTATION · DDL · HIT\nCREATE TABLE order_header",
                true, List.of()));
        when(imageInputResolver.resolve("支持审核前取消")).thenReturn(List.of());
        PrdDiscoveryService service = new PrdDiscoveryService(
                repository, mock(PrdDiscoveryRunRepository.class), evidence, runner,
                imageInputResolver, artifacts, List.of(),
                mock(org.springframework.beans.factory.ObjectProvider.class));

        PrdDiscoveryService.DiscoveryContext context = service.prepare("session-2");
        PrdDiscoveryService.DiscoveryAttempt attempt = service.generate(context, 1, "", List.of());
        service.publish("session-2", attempt.output());

        assertThat(runner.systemPrompt)
                .contains("不得把可从证据确认的信息转成用户问题")
                .contains("不要把用户提出的功能做法直接当成最终需求")
                .contains("### 4.2 复杂度审计")
                .contains("至少给出一个 OPT 候选方案")
                .contains("默认推荐最简单、可验证、可回退的方案")
                .contains("最多 5 个");
        assertThat(runner.userPrompt)
                .contains("planning-evidence-trace-v2")
                .contains("DOMAIN_KNOWLEDGE · HIT")
                .contains("DDL · HIT")
                .contains("CREATE TABLE order_header");
        verify(artifacts).write(
                "session-2",
                com.exceptioncoder.toolbox.prdclarify.domain.PrdArtifactType.INITIAL_SPEC,
                "# 初始化规格",
                new PrdArtifactService.ArtifactMetadata(null, PrdDiscoveryService.PROMPT_VERSION));
    }

    private static final class RecordingRunner implements AgentOneShotRunner {
        private String systemPrompt;
        private String userPrompt;

        @Override
        public String stream(String systemPrompt, String userPrompt, String model, String engine,
                             Consumer<String> onDelta) {
            this.systemPrompt = systemPrompt;
            this.userPrompt = userPrompt;
            onDelta.accept("# 初始化规格");
            return "# 初始化规格";
        }

        @Override
        public String runOnce(String systemPrompt, String userPrompt, String model, String engine) {
            this.systemPrompt = systemPrompt;
            this.userPrompt = userPrompt;
            return "# 初始化规格";
        }
    }
}
