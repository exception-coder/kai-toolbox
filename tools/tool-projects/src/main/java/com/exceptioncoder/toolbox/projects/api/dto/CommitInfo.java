package com.exceptioncoder.toolbox.projects.api.dto;

/**
 * 单条提交元数据（git log 解析）。
 *
 * @param hash      完整 commit hash
 * @param shortHash 短 hash
 * @param author    作者名
 * @param date      提交时间（ISO-8601，git %aI）
 * @param subject   提交标题（首行）
 */
public record CommitInfo(
        String hash,
        String shortHash,
        String author,
        String date,
        String subject
) {
}
