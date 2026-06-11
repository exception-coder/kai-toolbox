package com.exceptioncoder.toolbox.common.git;

/**
 * 单个提交的完整 diff（git show 原文）。
 *
 * @param hash      完整 commit hash
 * @param shortHash 短 hash
 * @param author    作者名
 * @param date      提交时间（ISO-8601）
 * @param subject   提交标题
 * @param diff      {@code git show --stat --patch --no-color} 原文
 * @param truncated 输出超上限被截断时为 true
 */
public record CommitDiff(
        String hash,
        String shortHash,
        String author,
        String date,
        String subject,
        String diff,
        boolean truncated
) {
}
