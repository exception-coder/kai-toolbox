package com.exceptioncoder.toolbox.claudechat.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SessionHistoryServiceTest {

    private static final String CONTINUATION_PREFIX =
            "This session is being continued from a previous conversation that ran out of context.";
    private static final String CONTINUATION_END =
            "Pick up the last task as if the break never happened.";

    @Test
    void shouldKeepNormalUserMessageUnchanged() {
        String message = "请继续修复历史消息显示。";

        assertThat(SessionHistoryService.normalizeCodexUserMessage(message)).isEqualTo(message);
    }

    @Test
    void shouldKeepOnlyRealInputAfterContinuationSummary() {
        String message = CONTINUATION_PREFIX
                + "\n\nSummary:\n- previous work"
                + "\n\n" + CONTINUATION_END
                + "\n\n\n这种内容为什么显示为我发送的？";

        assertThat(SessionHistoryService.normalizeCodexUserMessage(message))
                .isEqualTo("这种内容为什么显示为我发送的？");
    }

    @Test
    void shouldDropContinuationMessageWithoutRealInput() {
        String message = CONTINUATION_PREFIX
                + "\n\nSummary:\n- previous work"
                + "\n\n" + CONTINUATION_END;

        assertThat(SessionHistoryService.normalizeCodexUserMessage(message)).isEmpty();
    }

    @Test
    void shouldKeepIncompleteContinuationFrameUnchanged() {
        String message = CONTINUATION_PREFIX + "\n\n这是用户手动粘贴的片段。";

        assertThat(SessionHistoryService.normalizeCodexUserMessage(message)).isEqualTo(message);
    }
}
