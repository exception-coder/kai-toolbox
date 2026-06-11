package com.exceptioncoder.toolbox.aisecretary.api.dto;

import java.util.List;

/**
 * 前端展示用的记录视图：category 给枚举名，categoryLabel 给中文。
 */
public record NoteView(
        String id,
        String rawText,
        String category,
        String categoryLabel,
        String title,
        String dueTime,
        Double amount,
        List<String> tags,
        double confidence,
        boolean needsReview,
        String status,
        long createdAt,
        List<AttachmentView> attachments) {
}
