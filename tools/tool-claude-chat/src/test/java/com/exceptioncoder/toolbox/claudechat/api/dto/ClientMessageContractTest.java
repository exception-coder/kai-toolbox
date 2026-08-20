package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Verifies backward-compatible assistant metadata decoding on WebSocket messages. */
class ClientMessageContractTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void decodesLegacySendWithoutAssistantMetadata() throws Exception {
        ClientMessage.Send message = (ClientMessage.Send) objectMapper.readValue(
                """
                {"type":"send","text":"hello"}
                """, ClientMessage.class);

        assertThat(message.text()).isEqualTo("hello");
        assertThat(message.assistant()).isNull();
    }

    @Test
    void decodesVersionedAssistantMetadataAndIgnoresUnknownContextFields() throws Exception {
        ClientMessage.Send message = (ClientMessage.Send) objectMapper.readValue(
                """
                {
                  "type":"send",
                  "text":"why",
                  "assistant":{
                    "protocolVersion":"1.0",
                    "mode":"DIAGNOSE",
                    "contextSnapshot":{"futureField":{"enabled":true}}
                  }
                }
                """, ClientMessage.class);

        assertThat(message.assistant().protocolVersion()).isEqualTo("1.0");
        assertThat(message.assistant().mode()).isEqualTo("DIAGNOSE");
        assertThat(message.assistant().contextSnapshot()).containsKey("futureField");
    }
}
