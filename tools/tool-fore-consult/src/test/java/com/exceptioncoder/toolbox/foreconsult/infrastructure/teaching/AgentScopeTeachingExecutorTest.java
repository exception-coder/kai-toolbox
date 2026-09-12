package com.exceptioncoder.toolbox.foreconsult.infrastructure.teaching;

import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingConfig;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingScenario;
import com.exceptioncoder.toolbox.llm.config.LlmGatewayProperties;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 不调用付费模型，验证真实框架工具循环和配置边界。 */
class AgentScopeTeachingExecutorTest {
    private final AgentScopeTeachingExecutor executor = new AgentScopeTeachingExecutor(new LlmGatewayProperties());

    @Test
    void executesAllScriptedScenariosThroughAgentScope() {
        for (var scenario : TeachingScenario.all()) {
            var result = executor.execute(TeachingConfig.defaults(), request(scenario));
            assertThat(result.status()).as(scenario.id() + " " + result.answer()).isEqualTo("COMPLETED");
            assertThat(result.draft()).isNotNull();
            assertThat(result.draft().status()).isEqualTo(scenario.expectedStatus());
            assertThat(result.draft().sku()).isEqualTo(scenario.expectedSku());
            assertThat(result.draft().quantity()).isEqualTo(scenario.expectedQuantity());
            assertThat(result.steps()).anyMatch(step -> step.detail().contains("propose_draft"));
            assertThat(result.steps()).anyMatch(step -> step.type().equals("TOOL") && step.detail().contains("lookup_sku"));
            assertThat(result.steps()).anyMatch(step -> step.type().equals("TOOL_RESULT")
                    && step.detail().equals("lookup_sku · SUCCESS"));
            assertThat(result.tokens()).isNull();
        }
    }

    @Test
    void quantityLimitChangesActualValidation() {
        var base = TeachingConfig.defaults();
        var config = new TeachingConfig(base.model(), base.temperature(), base.prompt(), 50, 6, 30, 0, 1024, true);
        var result = executor.execute(config, request(TeachingScenario.find("complete")));
        assertThat(result.draft().status()).isEqualTo("INVALID");
    }

    @Test
    void oneIterationCannotClaimSuccessWithoutDraft() {
        var base = TeachingConfig.defaults();
        var config = new TeachingConfig(base.model(), base.temperature(), base.prompt(), 1000, 1, 30, 0, 1024, true);
        var result = executor.execute(config, request(TeachingScenario.find("complete")));
        assertThat(result.status()).isNotEqualTo("COMPLETED");
        assertThat(result.draft()).isNull();
    }

    @Test
    void disabledLookupDoesNotAppearInExecutedTools() {
        var base = TeachingConfig.defaults();
        var config = new TeachingConfig(base.model(), base.temperature(), base.prompt(), 1000, 6, 30, 0, 1024, false);
        var result = executor.execute(config, request(TeachingScenario.find("complete")));
        assertThat(result.status()).isEqualTo("COMPLETED");
        assertThat(result.steps()).noneMatch(step -> step.type().equals("TOOL") && step.detail().contains("lookup_sku"));
    }

    @Test
    void missingGatewayReturnsRecoverableFailureWithoutDraft() {
        var result = executor.execute(TeachingConfig.defaults(), new TeachingRequest(1L, "LIVE", null, "订 A123", null));
        assertThat(result.status()).isEqualTo("FAILED");
        assertThat(result.draft()).isNull();
        assertThat(executor.liveAvailable()).isFalse();
    }

    @Test
    void scriptsRejectArbitraryUserTextAndConfigRejectsNonFiniteTemperature() {
        assertThatThrownBy(() -> new TeachingRequest(1L, "DEMO", "complete", "任意文字", null).validate())
                .isInstanceOf(IllegalArgumentException.class);
        var config = new TeachingConfig("test", Double.NaN, "prompt", 100, 6, 30, 0, 1024, true);
        assertThatThrownBy(config::validate).isInstanceOf(IllegalArgumentException.class);
    }

    private TeachingRequest request(TeachingScenario scenario) {
        return new TeachingRequest(1L, "DEMO", scenario.id(), scenario.input(), scenario.previous());
    }
}
