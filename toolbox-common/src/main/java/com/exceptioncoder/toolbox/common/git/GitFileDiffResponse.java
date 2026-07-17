package com.exceptioncoder.toolbox.common.git;

/** 单个文件的 unified diff 内容（git diff 输出）。 */
public record GitFileDiffResponse(
        /** unified diff 原始文本 */
        String diff,
        /** 是否因超出大小上限而被截断 */
        boolean truncated
) {}
