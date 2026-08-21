package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.ServerMessage;

import java.util.List;
import java.util.Map;

/**
 * 公开计划评审消息投影，只允许业务对话和维持交互所需的最小协议通过。
 */
public final class ReviewPublicMessageProjector {

    private static final String PUBLIC_ERROR_CODE = "REVIEW_RESPONSE_FAILED";
    private static final String PUBLIC_ERROR_MESSAGE = "AI 暂时未能完成回复，请稍后重试。";

    private ReviewPublicMessageProjector() {
    }

    /**
     * 投影公开历史，过滤工具记录并清除回复锚点、用量和耗时。
     *
     * @param items 已合并评审意图的内部历史消息
     * @return 可返回公开页面的消息
     */
    public static List<ChatMessageView> projectHistory(List<ChatMessageView> items) {
        return items.stream()
                .map(ReviewPublicMessageProjector::projectHistoryItem)
                .filter(item -> item != null)
                .toList();
    }

    /**
     * 投影公开实时事件；返回 {@code null} 表示该内部事件不得下发。
     *
     * @param message 内部实时事件
     * @return 公开安全事件，或 {@code null}
     */
    public static ServerMessage projectRealtime(ServerMessage message) {
        if (message instanceof ServerMessage.Ready ready) {
            return new ServerMessage.Ready(ready.seq(), ready.sessionId(), null, List.of(), ready.status(),
                    ready.activeTurnId(), ready.epoch(), null, null, null, List.of(), List.of(), List.of(),
                    null, List.of(), null, null, null, null);
        }
        if (message instanceof ServerMessage.AssistantDelta
                || message instanceof ServerMessage.InterruptState) {
            return message;
        }
        if (message instanceof ServerMessage.ReviewIntent intent) {
            return new ServerMessage.ReviewIntent(intent.seq(), intent.messageId(), intent.turnId(), intent.intent(),
                    intent.classificationStatus(), 0.0, "", List.of(), intent.extractedTitle(),
                    intent.extractedContent());
        }
        if (message instanceof ServerMessage.Result result) {
            return new ServerMessage.Result(result.seq(), Map.of(), result.stopReason(), null);
        }
        if (message instanceof ServerMessage.ReplayGap gap) {
            return new ServerMessage.ReplayGap(gap.seq(), 0, 0);
        }
        if (message instanceof ServerMessage.Error error) {
            return new ServerMessage.Error(error.seq(), PUBLIC_ERROR_CODE, PUBLIC_ERROR_MESSAGE, error.terminal());
        }
        return null;
    }

    private static ChatMessageView projectHistoryItem(ChatMessageView item) {
        if ("user".equals(item.kind())) {
            ChatMessageView projected = ChatMessageView.user(item.id(), item.text(), item.ts());
            return item.reviewIntent() == null ? projected
                    : projected.withReviewIntent(projectIntent(item.reviewIntent()));
        }
        if ("assistant".equals(item.kind())) {
            return ChatMessageView.assistant(item.id(), item.text(), null, item.ts());
        }
        if ("result".equals(item.kind())) {
            return ChatMessageView.result(item.id(), "completed", item.ts(), null, null, null);
        }
        return null;
    }

    private static ChatMessageView.ReviewIntentView projectIntent(ChatMessageView.ReviewIntentView intent) {
        return new ChatMessageView.ReviewIntentView(intent.intent(), intent.classificationStatus(), 0.0, "",
                List.of(), intent.extractedTitle(), intent.extractedContent(), intent.sourceMessageId());
    }
}
