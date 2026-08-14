package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 验证 Sidecar 终态与持久队列释放之间的协议门禁。 */
class ClaudeChatQueueReleaseTest {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Test
    void shouldAcceptLegacySuccessfulResultWithoutExplicitSafetyField() throws Exception {
        assertThat(ClaudeChatService.queueReleaseAllowed(
                OBJECT_MAPPER.readTree("{\"stopReason\":\"end_turn\"}"))).isTrue();
    }

    @Test
    void shouldKeepQueueWhenSidecarMarksCompletionUnsafe() throws Exception {
        assertThat(ClaudeChatService.queueReleaseAllowed(
                OBJECT_MAPPER.readTree("{\"stopReason\":\"end_turn\",\"queueReleaseSafe\":false}"))).isFalse();
    }

    @Test
    void shouldRejectFailedResultEvenWhenSafetyFieldIsTrue() throws Exception {
        assertThat(ClaudeChatService.queueReleaseAllowed(
                OBJECT_MAPPER.readTree("{\"stopReason\":\"error\",\"queueReleaseSafe\":true}"))).isFalse();
    }
}
