package com.exceptioncoder.toolbox.aisecretary.api.dto;

import java.util.List;

/**
 * 前端展示用的记录视图：category 给枚举名，categoryLabel 给中文。
 *
 * <p>{@code vectorIndexed}：该记录是否已存在于向量库（实时查 Qdrant 真实存在性，非本地 flag）。
 * {@code true}=已入向量库，{@code false}=未入（双写漂移/RAG 写失败），{@code null}=RAG 未开或查询失败（未知）。
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
        List<AttachmentView> attachments,
        Boolean vectorIndexed) {
}
