package com.exceptioncoder.toolbox.docviewer.infra.dto;

import java.util.List;

/**
 * Trees API 拉取结果。三种状态互斥：
 * - UPDATED: nodes + etag 有值
 * - NOT_MODIFIED: 304，nodes/etag 均空
 * - RATE_LIMITED: 403 限流，rateLimitResetMillis 给出冷却结束时间
 */
public record TreeFetchResult(
        Outcome outcome,
        List<RawTreeNode> nodes,
        String etag,
        Long rateLimitResetMillis
) {
    public enum Outcome { UPDATED, NOT_MODIFIED, RATE_LIMITED }

    public static TreeFetchResult updated(List<RawTreeNode> nodes, String etag) {
        return new TreeFetchResult(Outcome.UPDATED, nodes, etag, null);
    }

    public static TreeFetchResult notModified() {
        return new TreeFetchResult(Outcome.NOT_MODIFIED, List.of(), null, null);
    }

    public static TreeFetchResult rateLimited(Long resetMillis) {
        return new TreeFetchResult(Outcome.RATE_LIMITED, List.of(), null, resetMillis);
    }

    public record RawTreeNode(String path, String type, String sha, Long size) {
    }
}
