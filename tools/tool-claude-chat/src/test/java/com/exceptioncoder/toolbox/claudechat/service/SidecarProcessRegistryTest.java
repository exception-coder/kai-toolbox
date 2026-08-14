package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SidecarProcessRegistryTest {

    @Test
    void shouldPassDeepSeekRuntimeArgumentsAsStructuredJson() throws IOException {
        ClaudeChatProperties properties = new ClaudeChatProperties();
        ClaudeChatProperties.DeepSeekHarness harness = properties.getDeepseekHarness();
        harness.setEnabled(true);
        harness.setCommand("node");
        harness.setArgs(List.of("runtime entry.js", "--profile", "review mode"));
        harness.setProvider("deepseek-official");
        harness.setModel("deepseek-v4-flash");
        harness.setMaxTokens(49_152);
        harness.setHandshakeTimeoutMs(12_000);
        harness.setTurnTimeoutMs(90_000);

        SidecarProcessRegistry registry = new SidecarProcessRegistry(properties, new ObjectMapper(), 18080);
        ProcessBuilder builder = new ProcessBuilder("node", "dist/server.js");

        registry.applyDeepSeekHarnessEnvironment(builder);

        Map<String, String> environment = builder.environment();
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_ENABLED")).isEqualTo("true");
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_COMMAND")).isEqualTo("node");
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_ARGS"))
                .isEqualTo("[\"runtime entry.js\",\"--profile\",\"review mode\"]");
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_PROVIDER")).isEqualTo("deepseek-official");
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_MODEL")).isEqualTo("deepseek-v4-flash");
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_MAX_TOKENS")).isEqualTo("49152");
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_HANDSHAKE_TIMEOUT_MS")).isEqualTo("12000");
        assertThat(environment.get("KAI_DEEPSEEK_HARNESS_TURN_TIMEOUT_MS")).isEqualTo("90000");
    }

    @Test
    void shouldKeepExperimentalRuntimeDisabledByDefault() throws IOException {
        ClaudeChatProperties properties = new ClaudeChatProperties();
        SidecarProcessRegistry registry = new SidecarProcessRegistry(properties, new ObjectMapper(), 18080);
        ProcessBuilder builder = new ProcessBuilder("node", "dist/server.js");

        registry.applyDeepSeekHarnessEnvironment(builder);

        assertThat(builder.environment().get("KAI_DEEPSEEK_HARNESS_ENABLED")).isEqualTo("false");
        assertThat(builder.environment()).doesNotContainKey("KAI_DEEPSEEK_HARNESS_COMMAND");
    }
}
