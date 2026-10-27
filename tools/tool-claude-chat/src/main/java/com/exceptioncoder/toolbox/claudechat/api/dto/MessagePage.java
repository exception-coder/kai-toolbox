package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * 历史消息分页结果。
 * items 按时间正序（早→晚）；nextBefore 为下一页（更早）游标 = 本批最早条目的全局索引，
 * 为 0 或 null 且 nextCursor 为空表示已到顶、无更早。
 * 字节分页使用不透明 nextCursor；空页或不足请求条数时仍可能有更早窗口，不能据条数判定结束。
 *
 * @param transcriptMissing 该会话有 sdkSessionId、但磁盘上已找不到对应 transcript
 *                          （Claude ~/.claude/projects 与 Codex ~/.codex/sessions 都没有）。
 *                          此时 items 为空，但语义不是「新会话还没消息」而是「记录已永久丢失、resume 必败」，
 *                          前端据此在进入会话的那一刻就提示，不必等用户发消息后由 sidecar 报 QUERY_FAILED。
 */
public record MessagePage(List<ChatMessageView> items, Integer nextBefore, boolean transcriptMissing, String nextCursor, String historyGap) {

    /** 旧客户端继续使用整数游标；字节游标由请求方显式选择。 */
    public MessagePage(List<ChatMessageView> items, Integer nextBefore, boolean transcriptMissing) {
        this(items, nextBefore, transcriptMissing, null, null);
    }

    public MessagePage(List<ChatMessageView> items, Integer nextBefore, boolean transcriptMissing, String nextCursor) {
        this(items, nextBefore, transcriptMissing, nextCursor, null);
    }

    public static MessagePage empty() {
        return new MessagePage(List.of(), null, false);
    }

    public static MessagePage missing() {
        return new MessagePage(List.of(), null, true);
    }
}
