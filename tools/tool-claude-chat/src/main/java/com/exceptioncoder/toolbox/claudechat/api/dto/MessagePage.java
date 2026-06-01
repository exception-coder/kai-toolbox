package com.exceptioncoder.toolbox.claudechat.api.dto;

import java.util.List;

/**
 * 历史消息分页结果。
 * items 按时间正序（早→晚）；nextBefore 为下一页（更早）游标 = 本批最早条目的全局索引，
 * 为 0 或 null 表示已到顶、无更早。
 */
public record MessagePage(List<ChatMessageView> items, Integer nextBefore) {}
