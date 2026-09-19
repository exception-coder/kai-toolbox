package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.exceptioncoder.toolbox.llm.observability.AgentTelemetry;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner.ExecutionRequest;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class AgentOneShotCapabilityTest {
    private final SidecarProcessRegistry processes = mock(SidecarProcessRegistry.class);
    private final SidecarClient sidecar = mock(SidecarClient.class);

    @Test
    void publicBeanRunsSimpleTextWithToolsDisabled() {
        try (var context = context()) {
            var runner = context.getBean(AgentOneShotRunner.class);
            reply(context, "claude", null, false);
            assertThat(runner.runText("Content")).isEqualTo("hello world");
            assertThat(runner.supportedEngines()).containsExactlyInAnyOrder("claude", "codex");
            assertThatThrownBy(() -> runner.supportedEngines().add("opencode"))
                    .isInstanceOf(UnsupportedOperationException.class);
            assertThat(context.getBean(AgentOneShotService.class).activeCount()).isZero();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"claude", "codex"})
    void namedRequestPreservesEngineAndModel(String engine) {
        try (var context = context()) {
            reply(context, engine, "selected-model", false);
            var request = ExecutionRequest.textBuilder().systemPrompt("Summarize")
                    .userPrompt("Content").model("selected-model").engine(engine).build();
            assertThat(context.getBean(AgentOneShotRunner.class).runObserved(request).text())
                    .isEqualTo("hello world");
            assertThat(request.systemPrompt()).isEqualTo("Summarize");
        }
    }

    @Test
    void simpleStreamingReturnsDeltasAndCompleteText() {
        try (var context = context()) {
            reply(context, "claude", null, false);
            List<String> deltas = new ArrayList<>();
            String text = context.getBean(AgentOneShotRunner.class).streamText("Content", deltas::add);
            assertThat(deltas).containsExactly("hello ", "world");
            assertThat(text).isEqualTo(String.join("", deltas));
        }
    }

    @Test
    void terminalSnapshotCorrectsOneShotFinalText() {
        try (var context = context()) {
            doAnswer(invocation -> {
                String id = invocation.getArgument(0);
                var service = context.getBean(AgentOneShotService.class);
                service.handle(id, JsonNodeFactory.instance.objectNode()
                        .put("type", "assistantDelta").put("text", "避免跨项目污���"));
                service.handle(id, JsonNodeFactory.instance.objectNode()
                        .put("type", "assistantSnapshot").put("text", "避免跨项目污染"));
                service.handle(id, JsonNodeFactory.instance.objectNode().put("type", "result"));
                return null;
            }).when(sidecar).oneShot(anyString(), any(ExecutionRequest.class), eq("claude"), isNull(), any(), any());

            assertThat(context.getBean(AgentOneShotRunner.class).runText("Content"))
                    .isEqualTo("避免跨项目污染");
        }
    }

    @Test
    void invalidRequestsFailBeforeStartingRuntime() {
        try (var context = context()) {
            var runner = context.getBean(AgentOneShotRunner.class);
            assertThatThrownBy(() -> runner.runOnce((ExecutionRequest) null))
                    .isInstanceOf(IllegalArgumentException.class);
            for (String prompt : new String[]{null, "", " \n "}) {
                assertThatThrownBy(() -> runner.runText(prompt))
                        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("userPrompt");
            }
            for (String engine : List.of("opencode", "unknown")) {
                var request = ExecutionRequest.textBuilder().userPrompt("Content").engine(engine).build();
                assertThatThrownBy(() -> runner.runOnce(request))
                        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining(engine);
            }
            verifyNoInteractions(processes, sidecar);
            assertThat(context.getBean(AgentOneShotService.class).activeCount()).isZero();
        }
    }

    @Test
    void runtimeErrorPropagatesAndCleansUpCall() {
        try (var context = context()) {
            reply(context, "claude", null, true);
            assertThatThrownBy(() -> context.getBean(AgentOneShotRunner.class).runText("Content"))
                    .isInstanceOf(RuntimeException.class).hasMessageContaining("login required");
            assertThat(context.getBean(AgentOneShotService.class).activeCount()).isZero();
        }
    }

    private AnnotationConfigApplicationContext context() {
        var context = new AnnotationConfigApplicationContext();
        context.registerBean(SidecarProcessRegistry.class, () -> processes);
        context.registerBean(SidecarClient.class, () -> sidecar);
        context.registerBean(ProjectSessionAccess.class, () -> mock(ProjectSessionAccess.class));
        context.registerBean(ClaudeChatProperties.class);
        context.registerBean(AgentTelemetry.class, () -> AgentTelemetry.noop(256));
        context.registerBean(AgentWorkAdmissionGate.class);
        context.register(AgentOneShotService.class);
        context.refresh();
        return context;
    }

    private void reply(AnnotationConfigApplicationContext context, String engine, String model, boolean fail) {
        doAnswer(invocation -> {
            ExecutionRequest request = invocation.getArgument(1);
            assertThat(request.toolPolicy()).isEqualTo(AgentOneShotRunner.TOOL_POLICY_DISABLED);
            assertThat(request.model()).isEqualTo(model);
            assertThat(request.cwd()).isNull();
            assertThat(request.authToken()).isNull();
            String id = invocation.getArgument(0);
            var service = context.getBean(AgentOneShotService.class);
            if (fail) {
                service.handle(id, JsonNodeFactory.instance.objectNode()
                        .put("type", "error").put("message", "login required"));
            } else {
                for (String delta : List.of("hello ", "world")) {
                    service.handle(id, JsonNodeFactory.instance.objectNode()
                            .put("type", "assistantDelta").put("text", delta));
                }
                service.handle(id, JsonNodeFactory.instance.objectNode().put("type", "result"));
            }
            return null;
        }).when(sidecar).oneShot(anyString(), any(ExecutionRequest.class), eq(engine), isNull(), any(), any());
    }
}
