package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Assistant 独立 SDK 待发送队列协议测试。 */
class AssistantQueueProtocolTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void shouldDeserializeQueueCommand() throws Exception {
        ClientMessage message = objectMapper.readValue("""
                {"type":"queue","id":"message-1","text":"继续诊断","displayText":"继续诊断",
                 "developerInstructions":"只读诊断","createdAt":1787040000000}
                """, ClientMessage.class);

        assertThat(message).isInstanceOf(ClientMessage.Queue.class);
        ClientMessage.Queue queue = (ClientMessage.Queue) message;
        assertThat(queue.id()).isEqualTo("message-1");
        assertThat(queue.text()).isEqualTo("继续诊断");
    }

    @Test
    void shouldSerializeQueueAcceptedEvent() throws Exception {
        String json = objectMapper.writeValueAsString(new ServerMessage.QueueAccepted(12L, "message-1", 2));

        assertThat(json).contains("\"type\":\"queueAccepted\"");
        assertThat(json).contains("\"seq\":12");
        assertThat(json).contains("\"queueSize\":2");
    }

    @Test
    void shouldDeserializeAssistantDraftCommand() throws Exception {
        ClientMessage message = objectMapper.readValue("""
                {"type":"assistantDraftCreate","requestId":"request-1","sessionId":"session-1",
                 "kind":"BUG","title":"审核失败","description":"订单无法审核",
                 "contextSnapshot":{"protocolVersion":"1.0"},"evidence":{}}
                """, ClientMessage.class);

        assertThat(message).isInstanceOf(ClientMessage.AssistantDraftCreate.class);
        assertThat(((ClientMessage.AssistantDraftCreate) message).kind()).isEqualTo("BUG");
    }

    @Test
    void shouldSerializeAssistantCommandResult() throws Exception {
        String json = objectMapper.writeValueAsString(new ServerMessage.AssistantCommandResult(
                0, "request-1", "draftCreate", true, java.util.Map.of("draftId", "draft-1"), null, null));

        assertThat(json).contains("\"type\":\"assistantCommandResult\"");
        assertThat(json).contains("\"action\":\"draftCreate\"");
        assertThat(json).contains("\"draftId\":\"draft-1\"");
    }
}
