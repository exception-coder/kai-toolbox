package com.exceptioncoder.toolbox;

import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingConfig;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.teaching.TeachingScenario;
import com.exceptioncoder.toolbox.foreconsult.infrastructure.teaching.AgentScopeTeachingExecutor;
import com.exceptioncoder.toolbox.llm.config.LlmGatewayProperties;
import io.modelcontextprotocol.server.McpSyncServer;
import io.modelcontextprotocol.spec.McpServerTransportProvider;
import org.junit.jupiter.api.Test;
import org.springframework.ai.mcp.server.autoconfigure.McpServerAutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import reactor.core.publisher.Mono;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 在宿主完整依赖类路径验证 MCP 服务与教学执行器共存。 */
class McpRuntimeCompatibilityTest {

    @Test
    void startsMcpServerAndExecutesTeachingToolsOnTheSameClasspath() {
        var transport = mock(McpServerTransportProvider.class);
        when(transport.closeGracefully()).thenReturn(Mono.empty());
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(McpServerAutoConfiguration.class))
                .withBean(McpServerTransportProvider.class, () -> transport)
                .withPropertyValues("spring.ai.mcp.server.stdio=false", "spring.ai.mcp.server.type=SYNC")
                .run(context -> {
                    assertThat(context).hasNotFailed().hasSingleBean(McpSyncServer.class);
                    var executor = new AgentScopeTeachingExecutor(new LlmGatewayProperties());
                    var scenario = TeachingScenario.find("complete");
                    var request = new TeachingRequest(1L, "DEMO", scenario.id(),
                            scenario.input(), scenario.previous());
                    var result = executor.execute(TeachingConfig.defaults(), request);
                    assertThat(result.status()).as(result.answer()).isEqualTo("COMPLETED");
                    assertThat(result.draft().sku()).isEqualTo(scenario.expectedSku());
                    assertThat(result.draft().quantity()).isEqualTo(scenario.expectedQuantity());
                    assertThat(result.steps()).anyMatch(step -> step.type().equals("TOOL_RESULT")
                            && step.detail().equals("lookup_sku · SUCCESS"));
                });
    }
}
