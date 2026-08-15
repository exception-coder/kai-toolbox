package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.AnalysisExecutionProfile;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.DevelopmentChangeContext;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.DevelopmentSyncPoint;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdDocChangeCandidate;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdDocChangeBaseline;
import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdDocChangeBaselineRepository;
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
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PrdDocChangeAnalysisServiceTest {

    private final PrdSessionRepository sessionRepository = mock(PrdSessionRepository.class);
    private final PrdDocChangeCandidateRepository candidateRepository =
            mock(PrdDocChangeCandidateRepository.class);
    private final PrdDocChangeBaselineRepository baselineRepository =
            mock(PrdDocChangeBaselineRepository.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<DevelopmentChangeContextProvider> providerHolder = mock(ObjectProvider.class);
    private final DevelopmentChangeContextProvider contextProvider = mock(DevelopmentChangeContextProvider.class);
    private final PrdDocChangeEvidenceBuilder evidenceBuilder = mock(PrdDocChangeEvidenceBuilder.class);
    private final PrdDocChangeAgentAnalyzer analyzer = mock(PrdDocChangeAgentAnalyzer.class);
    private final PrdDocChangeAgentVerifier verifier = mock(PrdDocChangeAgentVerifier.class);
    private final PrdDocChangeConfidencePolicy confidencePolicy = mock(PrdDocChangeConfidencePolicy.class);
    private final PrdPromptCatalog promptCatalog = mock(PrdPromptCatalog.class);
    private final PrdAiRunService aiRunService = mock(PrdAiRunService.class);
    private final PrdFileStore fileStore = mock(PrdFileStore.class);
    private PrdDocChangeAnalysisService service;
    private DevelopmentChangeContext context;
    private PrdDocChangeEvidenceBundle bundle;
    private PrdDocChangeAnalysisResult draft;
    private PrdDocChangeVerificationResult verification;

    @BeforeEach
    void setUp() throws Exception {
        service = new PrdDocChangeAnalysisService(sessionRepository, candidateRepository, baselineRepository,
                providerHolder, evidenceBuilder, analyzer, verifier, confidencePolicy,
                promptCatalog, aiRunService,
                fileStore, new ObjectMapper());
        PrdSession session = PrdSession.builder()
                .id("prd-1")
                .title("会话文档同步")
                .devSessionId("dev-1")
                .build();
        AnalysisExecutionProfile profile = new AnalysisExecutionProfile(
                "D:/work/project", "codex", "gpt-5.6", "high", "fast",
                null, null, "D:/codex-home", "official");
        context = new DevelopmentChangeContext(
                0, 3,
                List.of(new DevelopmentChangeContextProvider.ConversationEntry(
                        3, "assistant", "已完成接口调整")),
                List.of(), "hash-1", List.of(), profile);
        bundle = new PrdDocChangeEvidenceBundle(
                "会话文档同步", "", "", "# PRD", "", "prd-hash", "tdd-hash",
                List.of(), List.of(), profile);
        draft = new PrdDocChangeAnalysisResult(
                "TDD_ONLY", "调整接口实现", "产品行为不变", List.of(),
                List.of(), List.of("API 接口设计"), List.of(), "", 91, true);
        verification = new PrdDocChangeVerificationResult(
                true, "TDD_ONLY", List.of(), List.of(), List.of(), 0, List.of());
        when(sessionRepository.findById("prd-1")).thenReturn(Optional.of(session));
        when(providerHolder.getIfAvailable()).thenReturn(contextProvider);
        when(baselineRepository.find("prd-1", "dev-1")).thenReturn(Optional.empty());
        when(candidateRepository.findLatest("prd-1")).thenReturn(Optional.empty());
        when(contextProvider.snapshot("dev-1", new DevelopmentSyncPoint(0, java.util.Map.of())))
                .thenReturn(context);
        when(candidateRepository.findBySnapshot(any(), any(), any())).thenReturn(Optional.empty());
        when(fileStore.read("prd-1")).thenReturn("# PRD");
        when(evidenceBuilder.build(session, context, "# PRD", "", "[]", null)).thenReturn(bundle);
        when(promptCatalog.analysisProtocolFingerprint()).thenReturn("prompt-fingerprint");
        when(analyzer.analyzeWithAudit(bundle)).thenReturn(
                new PrdDocChangeAgentAnalyzer.AuditedAnalysis(draft, "analyzer-run"));
        when(verifier.verifyWithAudit(bundle, draft)).thenReturn(
                new PrdDocChangeAgentVerifier.AuditedVerification(verification, "verifier-run"));
        when(confidencePolicy.evaluate(bundle, draft, verification)).thenReturn(
                new PrdDocChangeFinalAnalysis(
                        "TDD_ONLY", "调整接口实现", "产品行为不变\n复核：通过",
                        List.of("[GIT-0001] Service 变化"), List.of(), List.of("API 接口设计"),
                        List.of(), "", 88));
    }

    @Test
    void storesEvidenceValidatedDecisionAndSnapshot() {
        PrdDocChangeCandidate result = service.analyze("prd-1");

        ArgumentCaptor<PrdDocChangeCandidate> captor = ArgumentCaptor.forClass(PrdDocChangeCandidate.class);
        verify(candidateRepository).insert(captor.capture());
        verify(baselineRepository).saveCandidateSnapshot(captor.getValue().getId(),
                context.repositories(), context.snapshotHash());
        verify(aiRunService).bindCandidate(
                List.of("analyzer-run", "verifier-run"), captor.getValue().getId());
        assertThat(result.getDecision()).isEqualTo("TDD_ONLY");
        assertThat(result.getConfidence()).isEqualTo(88);
        assertThat(result.getTddPatchPlanJson()).contains("API 接口设计");
    }

    @Test
    void reusesCandidateForIdenticalEvidenceSnapshot() {
        PrdDocChangeCandidate existing = PrdDocChangeCandidate.builder()
                .id("candidate-1")
                .prdSessionId("prd-1")
                .devSessionId("dev-1")
                .codeSnapshotHash(PrdDocChangeAnalysisService.ANALYSIS_PROTOCOL
                        + ":prompt-fingerprint:snapshot")
                .decision("NONE")
                .aiDecision("NONE")
                .summary("当前文档已覆盖新增说明")
                .evidenceJson("[\"CONV-0001\"]")
                .build();
        when(candidateRepository.findBySnapshot(any(), any(), any())).thenReturn(Optional.of(existing));

        PrdDocChangeCandidate result = service.analyze("prd-1");

        assertThat(result).isSameAs(existing);
        verify(analyzer, never()).analyzeWithAudit(bundle);
        verify(candidateRepository, never()).insert(any());
        verify(baselineRepository, never()).saveCandidateSnapshot(any(), any(), any());
    }

    @Test
    void doesNotReuseLegacyCandidateAfterAnalysisProtocolUpgrade() {
        PrdDocChangeCandidate legacy = PrdDocChangeCandidate.builder()
                .id("legacy-candidate")
                .prdSessionId("prd-1")
                .devSessionId("dev-1")
                .codeSnapshotHash("legacy-unversioned-snapshot")
                .decision("UNCERTAIN")
                .aiDecision("UNCERTAIN")
                .summary("旧评估结论")
                .evidenceJson("[\"CONV-0001\"]")
                .build();
        when(candidateRepository.findLatestMeaningful("prd-1")).thenReturn(Optional.of(legacy));
        when(candidateRepository.findBySnapshot(any(), any(), any())).thenReturn(Optional.of(legacy));

        PrdDocChangeCandidate result = service.analyze("prd-1");

        assertThat(result.getId()).isNotEqualTo("legacy-candidate");
        assertThat(result.getCodeSnapshotHash())
                .startsWith(PrdDocChangeAnalysisService.ANALYSIS_PROTOCOL + ":");
        verify(analyzer).analyzeWithAudit(bundle);
        verify(candidateRepository).insert(any());
    }

    @Test
    void doesNotExposeLegacyCandidateAsLatestCurrentAnalysis() {
        PrdDocChangeCandidate legacy = PrdDocChangeCandidate.builder()
                .id("legacy-candidate")
                .codeSnapshotHash("legacy-unversioned-snapshot")
                .summary("旧评估结论")
                .evidenceJson("[\"CONV-0001\"]")
                .build();
        when(candidateRepository.findLatest("prd-1")).thenReturn(Optional.of(legacy));

        assertThat(service.latest("prd-1")).isNull();
    }

    @Test
    void collectsFromLastCompletedBaselineWhenThereIsNoPreviousAnalysis() {
        PrdDocChangeBaseline baseline = new PrdDocChangeBaseline(
                "prd-1", "dev-1", 2, java.util.Map.of("repo-key", "abc1234"),
                "old-snapshot", "old-prd", "old-tdd", 1);
        DevelopmentSyncPoint syncPoint = new DevelopmentSyncPoint(
                2, java.util.Map.of("repo-key", "abc1234"));
        when(baselineRepository.find("prd-1", "dev-1")).thenReturn(Optional.of(baseline));
        when(contextProvider.snapshot("dev-1", syncPoint)).thenReturn(context);

        service.analyze("prd-1");

        verify(contextProvider).snapshot("dev-1", syncPoint);
    }

    @Test
    void promotesBaselineOnlyAfterTerminalSuccess() {
        PrdDocChangeCandidate applying = PrdDocChangeCandidate.builder()
                .id("candidate-1")
                .prdSessionId("prd-1")
                .devSessionId("dev-1")
                .conversationToSeq(3)
                .status("APPLYING")
                .applyStage("TDD")
                .build();
        PrdDocChangeCandidate applied = PrdDocChangeCandidate.builder()
                .id("candidate-1")
                .prdSessionId("prd-1")
                .devSessionId("dev-1")
                .conversationToSeq(3)
                .status("APPLIED")
                .applyStage("DONE")
                .build();
        when(candidateRepository.findById("candidate-1")).thenReturn(Optional.of(applying), Optional.of(applied));

        PrdDocChangeCandidate result = service.applyAction("candidate-1", "TDD_SUCCESS", null);

        assertThat(result.getStatus()).isEqualTo("APPLIED");
        verify(baselineRepository).promote(applied,
                sha256("# PRD"), sha256(""));
    }

    @Test
    void doesNotPromoteBaselineForDismissedCandidate() {
        PrdDocChangeCandidate pending = PrdDocChangeCandidate.builder()
                .id("candidate-1")
                .prdSessionId("prd-1")
                .devSessionId("dev-1")
                .status("PENDING")
                .applyStage("NONE")
                .build();
        PrdDocChangeCandidate dismissed = PrdDocChangeCandidate.builder()
                .id("candidate-1")
                .prdSessionId("prd-1")
                .devSessionId("dev-1")
                .status("DISMISSED")
                .applyStage("NONE")
                .build();
        when(candidateRepository.findById("candidate-1")).thenReturn(Optional.of(pending), Optional.of(dismissed));

        service.applyAction("candidate-1", "DISMISS", null);

        verify(baselineRepository, never()).promote(any(), any(), any());
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

    private static String sha256(String value) {
        try {
            var digest = java.security.MessageDigest.getInstance("SHA-256");
            return java.util.HexFormat.of().formatHex(
                    digest.digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }
}
