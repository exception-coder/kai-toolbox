package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PrdRequirementTypeResolverTest {

    @Test
    void usesExplicitTypeAndPositiveQuestionCountWithoutCallingAgent() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdRequirementTypeResolver resolver = resolver(runner);

        PrdRequirementTypeResolver.Resolution result =
                resolver.resolve("库存异常", "库存显示错误", "model-a", "claude", "BUG_FIX", 12);

        assertThat(result.reqType()).isEqualTo("BUG_FIX");
        assertThat(result.maxQuestions()).isEqualTo(12);
        verifyNoInteractions(runner);
    }

    @Test
    void appliesTypeDefaultWhenExplicitQuestionCountIsNotPositive() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        PrdRequirementTypeResolver resolver = resolver(runner);

        PrdRequirementTypeResolver.Resolution result =
                resolver.resolve("调整询价", "修改现有规则", null, "claude", "MODULE_ADJUST", 0);

        assertThat(result.reqType()).isEqualTo("MODULE_ADJUST");
        assertThat(result.maxQuestions()).isEqualTo(5);
        verifyNoInteractions(runner);
    }

    @Test
    void classifiesMissingTypeAndParsesFencedJson() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        when(runner.runOnce(anyString(), anyString(), eq("model-a"), eq("codex")))
                .thenReturn("```json\n{\"reqType\":\"BUG_FIX\",\"maxQuestions\":1}\n```");
        PrdRequirementTypeResolver resolver = resolver(runner);

        PrdRequirementTypeResolver.Resolution result =
                resolver.resolve("库存异常", "应该有库存但实际为零", "model-a", "codex", null, 9);

        assertThat(result.reqType()).isEqualTo("BUG_FIX");
        assertThat(result.maxQuestions()).isEqualTo(1);
        verify(runner).runOnce(anyString(), eq("标题：库存异常\n描述：应该有库存但实际为零"),
                eq("model-a"), eq("codex"));
    }

    @Test
    void treatsUnknownExplicitTypeAsAutomaticClassificationAndIgnoresItsQuestionCount() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        when(runner.runOnce(anyString(), anyString(), eq("model-a"), eq("claude")))
                .thenReturn("{\"reqType\":\"NEW_MODULE\",\"maxQuestions\":6}");
        PrdRequirementTypeResolver resolver = resolver(runner);

        PrdRequirementTypeResolver.Resolution result =
                resolver.resolve("新建看板", "增加全新看板", "model-a", "claude", "UNKNOWN", 2);

        assertThat(result.reqType()).isEqualTo("NEW_MODULE");
        assertThat(result.maxQuestions()).isEqualTo(6);
    }

    @Test
    void normalizesUnknownAgentTypeAndClampsPositiveQuestionCount() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        when(runner.runOnce(anyString(), anyString(), eq("model-a"), eq("claude")))
                .thenReturn("{\"reqType\":\"OTHER\",\"maxQuestions\":99}");
        PrdRequirementTypeResolver resolver = resolver(runner);

        PrdRequirementTypeResolver.Resolution result =
                resolver.resolve("未知需求", "描述", "model-a", "claude", null, null);

        assertThat(result.reqType()).isEqualTo("NEW_MODULE");
        assertThat(result.maxQuestions()).isEqualTo(10);
    }

    @Test
    void appliesResolvedTypeDefaultWhenAgentQuestionCountIsNotPositive() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        when(runner.runOnce(anyString(), anyString(), eq("model-a"), eq("claude")))
                .thenReturn("{\"reqType\":\"BUG_FIX\",\"maxQuestions\":0}");
        PrdRequirementTypeResolver resolver = resolver(runner);

        PrdRequirementTypeResolver.Resolution result =
                resolver.resolve("库存异常", "描述", "model-a", "claude", null, null);

        assertThat(result.reqType()).isEqualTo("BUG_FIX");
        assertThat(result.maxQuestions()).isEqualTo(2);
    }

    @Test
    void fallsBackWhenAgentReturnsInvalidJson() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        when(runner.runOnce(anyString(), anyString(), eq("model-a"), eq("claude")))
                .thenReturn("not-json");
        PrdRequirementTypeResolver resolver = resolver(runner);

        PrdRequirementTypeResolver.Resolution result =
                resolver.resolve("新需求", "描述", "model-a", "claude", null, null);

        assertThat(result.reqType()).isEqualTo("NEW_MODULE");
        assertThat(result.maxQuestions()).isEqualTo(8);
    }

    @Test
    void fallsBackWhenAgentFails() {
        AgentOneShotRunner runner = mock(AgentOneShotRunner.class);
        when(runner.runOnce(anyString(), anyString(), eq("model-a"), eq("claude")))
                .thenThrow(new IllegalStateException("agent unavailable"));
        PrdRequirementTypeResolver resolver = resolver(runner);

        PrdRequirementTypeResolver.Resolution result =
                resolver.resolve("新需求", "描述", "model-a", "claude", null, null);

        assertThat(result.reqType()).isEqualTo("NEW_MODULE");
        assertThat(result.maxQuestions()).isEqualTo(8);
    }

    private static PrdRequirementTypeResolver resolver(AgentOneShotRunner runner) {
        return new PrdRequirementTypeResolver(runner, new ObjectMapper());
    }
}
