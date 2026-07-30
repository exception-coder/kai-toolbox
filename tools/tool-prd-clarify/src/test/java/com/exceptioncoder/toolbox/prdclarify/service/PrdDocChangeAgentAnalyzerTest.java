package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider.AnalysisExecutionProfile;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PrdDocChangeAgentAnalyzerTest {

    @Test
    void reusesDevelopmentSessionExecutionProfileWithoutExposingTools() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdDocChangeAgentAnalyzer analyzer = new PrdDocChangeAgentAnalyzer(runner, new ObjectMapper());
        AnalysisExecutionProfile profile = new AnalysisExecutionProfile(
                "D:/work/project", "codex", "gpt-5.6", "xhigh", "fast",
                "https://gateway.example/v1", "secret", "D:/codex-home", "gateway");
        PrdDocChangeEvidenceBundle bundle = new PrdDocChangeEvidenceBundle(
                "搜索优化", "kai-toolbox", "claude-chat", "", "", "p", "t",
                List.of(new PrdDocChangeEvidenceBundle.EvidenceItem(
                        "CONV-0001", "USER_MESSAGE", "用户确认", "增加搜索", false)),
                List.of(), profile);
        when(runner.runOnce(org.mockito.ArgumentMatchers.any())).thenReturn("""
                {"decision":"PRD_ONLY","summary":"增加搜索","reasoning":"用户已确认",
                 "claims":[{"type":"CONFIRMED_REQUIREMENT","statement":"增加搜索",
                 "evidenceIds":["CONV-0001"],"documentImpact":"PRD"}],
                 "prdPatchPlan":["交互"],"tddPatchPlan":[],"risks":[],
                 "clarificationQuestion":"","modelConfidence":90}
                """);

        PrdDocChangeAnalysisResult result = analyzer.analyze(bundle);

        ArgumentCaptor<AgentOneShotRunner.ExecutionRequest> request =
                ArgumentCaptor.forClass(AgentOneShotRunner.ExecutionRequest.class);
        verify(runner).runOnce(request.capture());
        assertThat(request.getValue().cwd()).isEqualTo("D:/work/project");
        assertThat(request.getValue().model()).isEqualTo("gpt-5.6");
        assertThat(request.getValue().reasoningEffort()).isEqualTo("xhigh");
        assertThat(request.getValue().speed()).isEqualTo("fast");
        assertThat(request.getValue().toolPolicy()).isEqualTo(AgentOneShotRunner.TOOL_POLICY_DISABLED);
        assertThat(request.getValue().userPrompt()).doesNotContain("secret");
        assertThat(result.decision()).isEqualTo("PRD_ONLY");
    }

    @Test
    void parsesAllDecisionsAndFallsBackOnInvalidJson() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdDocChangeAgentAnalyzer analyzer = new PrdDocChangeAgentAnalyzer(runner, new ObjectMapper());
        PrdDocChangeEvidenceBundle bundle = bundle();
        for (String decision : List.of("NONE", "PRD_ONLY", "TDD_ONLY", "BOTH", "UNCERTAIN")) {
            when(runner.runOnce(org.mockito.ArgumentMatchers.any())).thenReturn("""
                    {"decision":"%s","summary":"","reasoning":"","claims":[],
                     "prdPatchPlan":[],"tddPatchPlan":[],"risks":[],
                     "clarificationQuestion":"","modelConfidence":50}
                    """.formatted(decision));
            assertThat(analyzer.analyze(bundle).decision()).isEqualTo(decision);
        }
        when(runner.runOnce(org.mockito.ArgumentMatchers.any())).thenReturn("not-json");

        PrdDocChangeAnalysisResult invalid = analyzer.analyze(bundle);

        assertThat(invalid.decision()).isEqualTo("UNCERTAIN");
        assertThat(invalid.parsed()).isFalse();
    }

    private PrdDocChangeEvidenceBundle bundle() {
        return new PrdDocChangeEvidenceBundle(
                "需求", "", "", "", "", "p", "t", List.of(), List.of(),
                new AnalysisExecutionProfile(
                        "D:/work", "claude", null, null, null,
                        null, null, null, "official"));
    }
}
