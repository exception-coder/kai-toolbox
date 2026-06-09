package com.exceptioncoder.toolbox.aisecretary.domain;

/**
 * 落库的一条结构化记录。tags 以 JSON 字符串数组存储。
 */
public record Note(
        String id,
        String rawText,
        NoteCategory category,
        String title,
        String dueTime,
        Double amount,
        String tagsJson,
        double confidence,
        boolean needsReview,
        String status,
        long createdAt) {
}
