package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.assistant.domain.AssistantIntent;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;

import static org.assertj.core.api.Assertions.assertThat;

/** Intent Router 契约测试。 */
class AssistantIntentRouterTest {

    private final StaticListableBeanFactory beans = new StaticListableBeanFactory();
    private final AssistantIntentRouter router = new AssistantIntentRouter(
            beans.getBeanProvider(AgentOneShotRunner.class), new ObjectMapper(), 1_000L);

    @Test
    void explicitBugModeCannotBeOverriddenByQuestionText() {
        assertThat(router.route("BUG", "这是什么功能？").intent()).isEqualTo(AssistantIntent.BUG);
    }

    @Test
    void autoFallsBackToUnknownWhenClassifierIsUnavailable() {
        assertThat(router.route("AUTO", "接口返回 500").intent()).isEqualTo(AssistantIntent.UNKNOWN);
    }

    @Test
    void autoAcceptsOnlyValidatedEnumOutput() {
        StaticListableBeanFactory modelBeans = new StaticListableBeanFactory();
        modelBeans.addBean("runner", new StubRunner("""
                {"intent":"DIAGNOSE","confidence":0.82,"reason":"需要证据排查"}
                """));
        AssistantIntentRouter modelRouter = new AssistantIntentRouter(
                modelBeans.getBeanProvider(AgentOneShotRunner.class), new ObjectMapper(), 1_000L);

        assertThat(modelRouter.route("AUTO", "帮我看看原因").intent()).isEqualTo(AssistantIntent.DIAGNOSE);
        assertThat(modelRouter.route("AUTO", "帮我看看原因").confidence()).isEqualTo(0.82D);
    }

    private record StubRunner(String response) implements AgentOneShotRunner {
        @Override
        public String stream(String systemPrompt, String userPrompt, String model, String engine,
                             java.util.function.Consumer<String> onDelta) {
            return response;
        }

        @Override
        public String runOnce(String systemPrompt, String userPrompt, String model, String engine) {
            return response;
        }
    }
}
