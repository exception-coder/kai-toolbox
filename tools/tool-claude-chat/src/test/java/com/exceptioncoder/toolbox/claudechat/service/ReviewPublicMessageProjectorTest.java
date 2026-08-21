package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.ServerMessage;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** 公开评审消息不得携带工具过程或技术运行信息。 */
class ReviewPublicMessageProjectorTest {

    @Test
    void historyKeepsBusinessConversationAndRemovesDiagnostics() {
        ChatMessageView user = ChatMessageView.user("u1", "请隐藏工具调用", 10L, "turn-1")
                .withReviewIntent(new ChatMessageView.ReviewIntentView(
                        "REQUIREMENT", "CONFIRMED", 0.98, "明确提出页面变化", List.of("隐藏"),
                        "隐藏工具调用", "业务说明", "message-1"));
        ChatMessageView assistant = ChatMessageView.assistant("a1", "已整理需求", "fork-secret", 20L);
        ChatMessageView tool = ChatMessageView.tool("t1", "Read", Map.of("path", "secret"),
                "file content", false, 25L, 15L);
        ChatMessageView result = ChatMessageView.result("r1", "success", 30L,
                Map.of("input_tokens", 100), 500L, 120L);

        List<ChatMessageView> projected = ReviewPublicMessageProjector.projectHistory(
                List.of(user, assistant, tool, result));

        assertThat(projected).extracting(ChatMessageView::kind)
                .containsExactly("user", "assistant", "result");
        assertThat(projected.get(0).turnId()).isNull();
        assertThat(projected.get(0).reviewIntent().confidence()).isZero();
        assertThat(projected.get(0).reviewIntent().reason()).isEmpty();
        assertThat(projected.get(0).reviewIntent().signals()).isEmpty();
        assertThat(projected.get(1).forkAnchor()).isNull();
        assertThat(projected.get(2).usage()).isNull();
        assertThat(projected.get(2).latencyMs()).isNull();
        assertThat(projected.get(2).ttftMs()).isNull();
    }

    @Test
    void realtimeDropsTechnicalEventsAndSanitizesLifecycleEvents() {
        ServerMessage tool = new ServerMessage.ToolUse(2L, "call-1", "Read", Map.of("path", "secret"));
        ServerMessage result = new ServerMessage.Result(3L, Map.of("output_tokens", 42), "success", "trace-1");
        ServerMessage error = new ServerMessage.Error(4L, "INTERNAL", "C:/secret failed", true);
        ServerMessage.Ready ready = new ServerMessage.Ready(1L, "review-1", "sdk-secret", List.of("/model"),
                "RUNNING", "turn-1", "epoch-1", "codex", "thirdParty", "https://gateway.example",
                List.of("skill"), List.of("agent"), List.of(), "style", List.of(), "gpt-secret", "high",
                "fast", "server");

        assertThat(ReviewPublicMessageProjector.projectRealtime(tool)).isNull();
        ServerMessage.Result publicResult = (ServerMessage.Result)
                ReviewPublicMessageProjector.projectRealtime(result);
        assertThat(publicResult.usage()).isEmpty();
        assertThat(publicResult.traceId()).isNull();
        ServerMessage.Error publicError = (ServerMessage.Error)
                ReviewPublicMessageProjector.projectRealtime(error);
        assertThat(publicError.code()).isEqualTo("REVIEW_RESPONSE_FAILED");
        assertThat(publicError.message()).doesNotContain("secret");
        ServerMessage.Ready publicReady = (ServerMessage.Ready)
                ReviewPublicMessageProjector.projectRealtime(ready);
        assertThat(publicReady.sdkSessionId()).isNull();
        assertThat(publicReady.engine()).isNull();
        assertThat(publicReady.providerBaseUrl()).isNull();
        assertThat(publicReady.selectedModel()).isNull();
        assertThat(publicReady.slashCommands()).isEmpty();
    }
}
