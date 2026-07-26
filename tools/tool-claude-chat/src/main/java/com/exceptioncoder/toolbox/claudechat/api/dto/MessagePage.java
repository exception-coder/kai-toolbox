package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * 历史消息分页结果。
 * items 按时间正序（早→晚）；nextBefore 为下一页（更早）游标 = 本批最早条目的全局索引，
 * 为 0 或 null 表示已到顶、无更早。
 *
 * @param transcriptMissing 该会话有 sdkSessionId、但磁盘上已找不到对应 transcript
 *                          （Claude ~/.claude/projects 与 Codex ~/.codex/sessions 都没有）。
 *                          此时 items 为空，但语义不是「新会话还没消息」而是「记录已永久丢失、resume 必败」，
 *                          前端据此在进入会话的那一刻就提示，不必等用户发消息后由 sidecar 报 QUERY_FAILED。
 */
public record MessagePage(List<ChatMessageView> items, Integer nextBefore, boolean transcriptMissing) {

    public static MessagePage empty() {
        return new MessagePage(List.of(), null, false);
    }

    public static MessagePage missing() {
        return new MessagePage(List.of(), null, true);
    }
}
