package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdDocChangeCandidate;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdDocChangeCandidateRepository;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PrdDocChangeAnalysisServiceTest {

    private final PrdSessionRepository sessionRepository = mock(PrdSessionRepository.class);
    private final PrdDocChangeCandidateRepository candidateRepository =
            mock(PrdDocChangeCandidateRepository.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<DevelopmentChangeContextProvider> providerHolder = mock(ObjectProvider.class);
    private final DevelopmentChangeContextProvider contextProvider = mock(DevelopmentChangeContextProvider.class);
    private final AgentOneShotRunner agentRunner = mock(AgentOneShotRunner.class);
    private final PrdFileStore fileStore = mock(PrdFileStore.class);
    private PrdDocChangeAnalysisService service;

    @BeforeEach
    void setUp() throws Exception {
        service = new PrdDocChangeAnalysisService(sessionRepository, candidateRepository, providerHolder,
                agentRunner, fileStore, new ObjectMapper());
        PrdSession session = PrdSession.builder()
                .id("prd-1")
                .title("会话文档同步")
                .devSessionId("dev-1")
                .engine("codex")
                .build();
        when(sessionRepository.findById("prd-1")).thenReturn(Optional.of(session));
        when(providerHolder.getIfAvailable()).thenReturn(contextProvider);
        when(candidateRepository.findLatest("prd-1")).thenReturn(Optional.empty());
        when(candidateRepository.findBySnapshot("prd-1", "dev-1", "hash-1")).thenReturn(Optional.empty());
        when(fileStore.read("prd-1")).thenReturn("# PRD");
        when(contextProvider.snapshot("dev-1", 0)).thenReturn(new DevelopmentChangeContextProvider.DevelopmentChangeContext(
                0, 3,
                List.of(new DevelopmentChangeContextProvider.ConversationEntry(3, "assistant", "已完成接口调整")),
                List.of(), "hash-1", List.of()));
    }

    @Test
    void storesValidatedStructuredDecision() {
        when(agentRunner.runOnce(any(), any(), any(), eq("codex"))).thenReturn("""
                {"decision":"TDD_ONLY","summary":"调整接口实现","reasoning":"产品行为不变",
                 "evidence":["Git 显示 Service 变化"],"prdPatchPlan":[],
                 "tddPatchPlan":["API 接口设计"],"risks":[],"clarificationQuestion":"","confidence":91}
                """);

        PrdDocChangeCandidate result = service.analyze("prd-1");

        ArgumentCaptor<PrdDocChangeCandidate> captor = ArgumentCaptor.forClass(PrdDocChangeCandidate.class);
        verify(candidateRepository).insert(captor.capture());
        assertThat(result.getDecision()).isEqualTo("TDD_ONLY");
        assertThat(result.getAiDecision()).isEqualTo("TDD_ONLY");
        assertThat(result.getConfidence()).isEqualTo(91);
        assertThat(captor.getValue().getTddPatchPlanJson()).contains("API 接口设计");
    }

    @Test
    void invalidModelOutputFallsBackToUncertain() {
        when(agentRunner.runOnce(any(), any(), any(), anyString())).thenReturn("not-json");

        PrdDocChangeCandidate result = service.analyze("prd-1");

        assertThat(result.getDecision()).isEqualTo("UNCERTAIN");
        assertThat(result.getClarificationQuestion()).isNotBlank();
        assertThat(result.getConfidence()).isZero();
    }

    @Test
    void reusesCandidateForIdenticalSnapshot() {
        PrdDocChangeCandidate existing = PrdDocChangeCandidate.builder()
                .id("candidate-1")
                .prdSessionId("prd-1")
                .devSessionId("dev-1")
                .decision("NONE")
                .aiDecision("NONE")
                .build();
        when(candidateRepository.findBySnapshot("prd-1", "dev-1", "hash-1"))
                .thenReturn(Optional.of(existing));

        PrdDocChangeCandidate result = service.analyze("prd-1");

        assertThat(result).isSameAs(existing);
        verify(agentRunner, never()).runOnce(any(), any(), any(), anyString());
        verify(candidateRepository, never()).insert(any());
    }

    @Test
    void rejectsStageJumpThatWouldCorruptResumeState() {
        PrdDocChangeCandidate pending = PrdDocChangeCandidate.builder()
                .id("candidate-1")
                .status("PENDING")
                .applyStage("NONE")
                .build();
        when(candidateRepository.findById("candidate-1")).thenReturn(Optional.of(pending));

        assertThatThrownBy(() -> service.applyAction("candidate-1", "START_TDD", null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("PENDING/NONE");
    }
}
