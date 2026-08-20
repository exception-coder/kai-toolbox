package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AssistantEnvelopePromptBuilderTest {

    private final AssistantEnvelopePromptBuilder builder = new AssistantEnvelopePromptBuilder(new ObjectMapper());

    @Test
    void keepsLegacyInstructionsAndAddsEvidenceContract() {
        String result = builder.merge("原调度约束", new ClientMessage.AssistantEnvelope(
                "1.0", "DIAGNOSE", Map.of("page", Map.of("url", "/orders/1"))));

        assertThat(result).contains("原调度约束", "已确认事实", "DIAGNOSE", "/orders/1");
    }

    @Test
    void rejectsUnknownProtocolAndMode() {
        assertThatThrownBy(() -> builder.merge(null,
                new ClientMessage.AssistantEnvelope("2.0", "BUG", Map.of())))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> builder.merge(null,
                new ClientMessage.AssistantEnvelope("1.0", "DELETE", Map.of())))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
